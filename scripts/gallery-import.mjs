#!/usr/bin/env node
/**
 * Puts photos and videos from the Gallery folder on /work ("Our Work").
 *
 *   node --env-file=.env.local scripts/gallery-import.mjs             add what is new
 *   node --env-file=.env.local scripts/gallery-import.mjs --dry-run   process only, upload nothing
 *   node --env-file=.env.local scripts/gallery-import.mjs --only doorway-curtains
 *   node --env-file=.env.local scripts/gallery-import.mjs --replace   overwrite pieces already there
 *
 * The Gallery folder never enters git (the repository is public) and holds a
 * pieces.json that says which files make which piece, with the words for each
 * — see pieces.example.json next to this script.
 *
 * What happens to each file on the way:
 *
 *  - Photos are re-encoded, which drops everything a phone writes into a
 *    picture besides the picture: the model, the time and — the one that
 *    matters, for a workroom at home — the GPS position. Checked afterwards.
 *  - Videos come out as MP4 (H.264, 720 wide) that every browser plays and a
 *    phone streams at once, with the same metadata gone. A small video — the
 *    first ones came through Telegram at 464x848 — is sharpened first with the
 *    scaler built into macOS 26 (scripts/gallery/superres.swift).
 *  - Each video gets a cover picture, and the pieces' videos are cut into a
 *    ten-second showreel for the top of the page.
 *
 * A piece already on the site is left as it is, because Kristina may have
 * edited it in the Studio since: --replace is the only way to overwrite one.
 * Processed files are kept in Gallery/.processed, so a second run is quick.
 */

import { createClient } from "@sanity/client";
import sharp from "sharp";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const manifestPath = path.resolve(ROOT, option("manifest", "Gallery/pieces.json"));
const sourceDir = path.dirname(manifestPath);
const cacheDir = path.join(sourceDir, ".processed");
const dryRun = flag("dry-run");
const replace = flag("replace");
const only = option("only", null);

/** The width the site serves an upright video at: a phone at 2x needs no more */
const VIDEO_WIDTH = 720;
/** Anything narrower is sharpened before it is encoded */
const SHARPEN_BELOW = 720;
/** The showreel's frame and the length of the cross-fade between its clips */
const REEL = { width: 540, height: 960, fade: 0.5 };
const SETTINGS_ID = "siteSettings";

// ─── small tools ─────────────────────────────────────────────────────────────

function run(command, argv) {
  const result = spawnSync(command, argv, { stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 });
  if (result.error) throw new Error(`${command}: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${command} failed:\n${result.stderr.toString().slice(-1500)}`);
  return result.stdout.toString();
}

function hashOf(...parts) {
  return createHash("sha1").update(parts.join("\u0000")).digest("hex").slice(0, 16);
}

function fileHash(file) {
  return createHash("sha1").update(fs.readFileSync(file)).digest("hex");
}

function probe(file) {
  const info = JSON.parse(run("ffprobe", ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", file]));
  const video = info.streams.find((s) => s.codec_type === "video");
  if (!video) throw new Error(`${file} has no picture in it`);
  return {
    width: video.width,
    height: video.height,
    duration: Number(info.format.duration),
    hasAudio: info.streams.some((s) => s.codec_type === "audio"),
    tags: { ...(info.format.tags ?? {}), ...(video.tags ?? {}) },
  };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Makes `out` unless it is already there — under a temporary name, moved into
 * place only once whole. A run that fails halfway would otherwise leave an
 * empty file the next run takes for finished work.
 */
async function produce(out, make) {
  if (fs.existsSync(out)) return out;
  const part = out.replace(/(\.[A-Za-z0-9]+)$/, ".part$1");
  fs.rmSync(part, { force: true });
  await make(part);
  fs.renameSync(part, out);
  return out;
}

/** Latitude, longitude or a place name left in a processed file stops the run */
const WHERE = /location|gps|xyz|iso6709|latitude|longitude/i;

// ─── photos ──────────────────────────────────────────────────────────────────

async function processPhoto(item) {
  const source = path.join(sourceDir, item.file);
  const out = path.join(cacheDir, `${hashOf("photo-v1", fileHash(source), JSON.stringify(item.crop ?? null))}.jpg`);
  await produce(out, async (part) => {
    // Upright first, by whatever the camera wrote — then nothing it wrote survives
    let image = sharp(source).rotate();
    if (item.crop) image = image.extract(item.crop);
    await image
      .resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true })
      .toColorspace("srgb")
      .jpeg({ quality: 90, mozjpeg: true, progressive: true })
      .toFile(part);
  });
  const meta = await sharp(out).metadata();
  if (meta.exif || meta.xmp || meta.iptc) throw new Error(`${item.file}: metadata survived processing`);
  return { file: out, width: meta.width, height: meta.height };
}

// ─── videos ──────────────────────────────────────────────────────────────────

let scaler;
function sharpener() {
  if (scaler !== undefined) return scaler;
  scaler = null;
  if (process.platform !== "darwin") return scaler;
  const swift = path.join(ROOT, "scripts/gallery/superres.swift");
  const binary = path.join(cacheDir, "superres");
  if (!fs.existsSync(binary) || fs.statSync(binary).mtimeMs < fs.statSync(swift).mtimeMs) {
    const built = spawnSync("swiftc", ["-O", swift, "-o", binary], { stdio: "inherit" });
    if (built.status !== 0) {
      console.warn("  (this Mac can't build the sharpener: videos keep their own size)");
      return scaler;
    }
  }
  scaler = binary;
  return scaler;
}

async function processVideo(item) {
  const source = path.join(sourceDir, item.file);
  const info = probe(source);
  const hash = fileHash(source);

  // The sharpened copy, when the source is small enough to need one
  let picture = source;
  if (Math.min(info.width, info.height) < SHARPEN_BELOW && sharpener()) {
    picture = await produce(path.join(cacheDir, `${hashOf("superres-v1", hash)}.mov`), (part) => {
      console.log(`    sharpening ${item.file} (a few minutes)…`);
      run(sharpener(), [source, part, "2"]);
    });
  }

  const out = path.join(cacheDir, `${hashOf("mp4-v1", hash, picture === source ? "as-filmed" : "sharpened")}.mp4`);
  await produce(out, (part) => {
    const upright = info.height >= info.width;
    const argv = ["-y", "-v", "error", "-i", picture];
    if (picture !== source && info.hasAudio) argv.push("-i", source);
    argv.push("-map", "0:v:0");
    // The sound is the room's — shears, a zip — and comes from the original
    if (info.hasAudio) argv.push("-map", picture !== source ? "1:a:0" : "0:a:0");
    argv.push(
      "-vf",
      `${upright ? `scale=${VIDEO_WIDTH}:-2` : `scale=-2:${VIDEO_WIDTH}`}:flags=lanczos,format=yuv420p`,
      "-c:v", "libx264", "-preset", "slow", "-crf", "22", "-profile:v", "high",
      "-maxrate", "3M", "-bufsize", "6M", "-r", "30"
    );
    if (info.hasAudio) argv.push("-c:a", "aac", "-b:a", "96k", "-ac", "2");
    argv.push("-map_metadata", "-1", "-map_chapters", "-1", "-movflags", "+faststart", "-shortest", part);
    run("ffmpeg", argv);
  });

  const final = probe(out);
  const leaked = Object.keys(final.tags).filter((key) => WHERE.test(key) || WHERE.test(String(final.tags[key])));
  if (leaked.length) throw new Error(`${item.file}: ${leaked.join(", ")} survived processing`);

  // The cover: one frame from the sharpest copy there is
  const at = Number(item.poster ?? 1);
  const poster = await produce(path.join(cacheDir, `${hashOf("poster-v1", hash, String(at))}.jpg`), async (part) => {
    const frame = await produce(path.join(cacheDir, `${hashOf("frame-v1", hash, String(at))}.png`), (framePart) => {
      run("ffmpeg", ["-y", "-v", "error", "-ss", String(at), "-i", picture, "-frames:v", "1", framePart]);
    });
    await sharp(frame)
      .resize({ width: 1080, withoutEnlargement: true })
      .jpeg({ quality: 86, mozjpeg: true, progressive: true })
      .toFile(part);
  });

  return {
    file: out,
    poster,
    sharpest: picture,
    width: final.width,
    height: final.height,
    duration: Math.round(final.duration * 10) / 10,
  };
}

// ─── the showreel ────────────────────────────────────────────────────────────

async function buildShowreel(reel, sharpestOf) {
  const clips = reel.clips.map((clip) => ({ ...clip, input: sharpestOf.get(clip.file) }));
  const missing = clips.filter((c) => !c.input).map((c) => c.file);
  if (missing.length) throw new Error(`showreel: ${missing.join(", ")} is not a video of any piece`);

  const key = hashOf("reel-v1", JSON.stringify(reel.clips), ...clips.map((c) => fileHash(c.input)));
  const out = await produce(path.join(cacheDir, `${key}.mp4`), (part) => {
    const { width, height, fade } = REEL;
    const parts = clips.map(
      (c, i) =>
        `[${i}:v]trim=start=${c.from}:duration=${c.length},setpts=PTS-STARTPTS,` +
        `scale=${width}:${height}:force_original_aspect_ratio=increase:flags=lanczos,crop=${width}:${height},` +
        `fps=30,format=yuv420p,settb=AVTB[c${i}]`
    );
    let last = "c0";
    let elapsed = clips[0].length;
    clips.slice(1).forEach((c, i) => {
      const next = `x${i + 1}`;
      parts.push(`[${last}][c${i + 1}]xfade=transition=fade:duration=${fade}:offset=${(elapsed - fade).toFixed(3)}[${next}]`);
      elapsed += c.length - fade;
      last = next;
    });
    // The cross-fades hand back full-colour frames; the H.264 every phone plays wants 4:2:0
    parts.push(`[${last}]format=yuv420p[reel]`);
    run("ffmpeg", [
      "-y", "-v", "error",
      ...clips.flatMap((c) => ["-i", c.input]),
      "-filter_complex", parts.join(";"),
      "-map", "[reel]",
      "-an", "-c:v", "libx264", "-preset", "slow", "-crf", "25", "-profile:v", "high",
      "-map_metadata", "-1", "-movflags", "+faststart",
      part,
    ]);
  });
  const poster = await produce(path.join(cacheDir, `${key}-cover.jpg`), async (part) => {
    const frame = await produce(path.join(cacheDir, `${key}-cover.png`), (framePart) => {
      run("ffmpeg", ["-y", "-v", "error", "-ss", "0.4", "-i", out, "-frames:v", "1", framePart]);
    });
    await sharp(frame).jpeg({ quality: 84, mozjpeg: true, progressive: true }).toFile(part);
  });
  return { file: out, poster };
}

// ─── Sanity ──────────────────────────────────────────────────────────────────

function sanity() {
  const token = process.env.SANITY_API_WRITE_TOKEN;
  if (!token) throw new Error("SANITY_API_WRITE_TOKEN is not set: run with --env-file=.env.local");
  return createClient({
    projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || "5uun6fw6",
    dataset: process.env.NEXT_PUBLIC_SANITY_DATASET || "production",
    apiVersion: "2026-02-13",
    token,
    useCdn: false,
  });
}

/** Sanity keeps one copy of identical bytes, so uploading a file twice costs nothing but the upload */
async function upload(client, kind, file, filename) {
  const contentType = file.endsWith(".mp4") ? "video/mp4" : "image/jpeg";
  const asset = await client.assets.upload(kind, fs.createReadStream(file), { filename, contentType });
  return { _type: "reference", _ref: asset._id };
}

const today = new Date().toISOString().slice(0, 10);

async function main() {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  fs.mkdirSync(cacheDir, { recursive: true });
  const pieces = manifest.pieces.filter((p) => !only || p.id === only);
  if (pieces.length === 0) throw new Error(only ? `no piece "${only}" in ${manifestPath}` : "the manifest has no pieces");

  // Everything processed first: a bad file stops the run before anything is sent
  console.log(`Processing ${pieces.length} piece(s)…`);
  const processed = new Map();
  const sharpestOf = new Map();
  for (const piece of pieces) {
    console.log(`  ${piece.id}`);
    const before = piece.before ? await processPhoto(piece.before) : null;
    const media = [];
    for (const item of piece.media) {
      if (item.file.toLowerCase().endsWith(".mp4") || item.file.toLowerCase().endsWith(".mov")) {
        const video = await processVideo(item);
        sharpestOf.set(item.file, video.sharpest);
        media.push({ kind: "video", item, ...video });
      } else {
        media.push({ kind: "photo", item, ...(await processPhoto(item)) });
      }
    }
    processed.set(piece.id, { before, media });
  }
  const reel = manifest.showreel && !only ? await buildShowreel(manifest.showreel, sharpestOf) : null;

  if (dryRun) {
    for (const piece of pieces) {
      const { before, media } = processed.get(piece.id);
      console.log(`\n${piece.id} — ${piece.title}`);
      if (before) console.log(`  before  ${path.relative(ROOT, before.file)}`);
      for (const m of media) {
        const size = (fs.statSync(m.file).size / 1024 / 1024).toFixed(2);
        console.log(`  ${m.kind.padEnd(6)}  ${path.relative(ROOT, m.file)}  ${m.width}x${m.height}  ${size} MB${m.duration ? `  ${m.duration}s` : ""}`);
      }
    }
    if (reel) console.log(`\nshowreel  ${path.relative(ROOT, reel.file)}  ${(fs.statSync(reel.file).size / 1024 / 1024).toFixed(2)} MB`);
    console.log("\nDry run: nothing uploaded.");
    return;
  }

  const client = sanity();

  // Created last-first, a second apart: pieces sharing a date are shown by
  // when they were created, newest first, and Sanity counts that in seconds
  for (const piece of [...pieces].reverse()) {
    const id = `workPiece-${piece.id}`;
    const [published, draft] = await Promise.all([client.getDocument(id), client.getDocument(`drafts.${id}`)]);
    if ((published || draft) && !replace) {
      console.log(`  kept    ${piece.id} (already on the site — --replace overwrites it)`);
      continue;
    }

    const { before, media } = processed.get(piece.id);
    const image = async (file, name) => ({ _type: "image", asset: await upload(client, "image", file, name) });

    const doc = {
      _id: id,
      _type: "workPiece",
      title: piece.title,
      caption: piece.caption,
      category: piece.category,
      service: piece.service,
      shelf: piece.shelf,
      date: piece.date ?? today,
      before: before ? { ...(await image(before.file, `${piece.id}-before.jpg`)), alt: piece.before.alt } : undefined,
      media: [],
    };
    for (const [i, m] of media.entries()) {
      if (m.kind === "photo") {
        doc.media.push({
          _key: `m${i}`,
          _type: "workPhoto",
          asset: await upload(client, "image", m.file, `${piece.id}-${i + 1}.jpg`),
          alt: m.item.alt,
        });
      } else {
        doc.media.push({
          _key: `m${i}`,
          _type: "workVideo",
          file: { _type: "file", asset: await upload(client, "file", m.file, `${piece.id}-${i + 1}.mp4`) },
          poster: await image(m.poster, `${piece.id}-${i + 1}-cover.jpg`),
          alt: m.item.alt,
          width: m.width,
          height: m.height,
          duration: m.duration,
        });
      }
    }

    await client.createOrReplace(doc);
    console.log(`  ${published || draft ? "replaced" : "added  "} ${piece.id} (${media.length + (before ? 1 : 0)} files)`);
    await sleep(1100);
  }

  if (reel) {
    const [settings, draft] = await Promise.all([
      client.getDocument(SETTINGS_ID),
      client.getDocument(`drafts.${SETTINGS_ID}`),
    ]);
    if (settings?.workPage?.showreel && !replace) {
      console.log("  kept    showreel (already set — --replace overwrites it)");
    } else {
      const workPage = {
        showreel: { _type: "file", asset: await upload(client, "file", reel.file, "our-work-showreel.mp4") },
        showreelPoster: { _type: "image", asset: await upload(client, "image", reel.poster, "our-work-showreel-cover.jpg") },
      };
      // An unpublished edit to Site Settings would put the old page back when
      // Kristina publishes it, so the draft gets the showreel too
      const transaction = client.transaction().patch(SETTINGS_ID, (p) => p.set({ workPage }));
      if (draft) transaction.patch(`drafts.${SETTINGS_ID}`, (p) => p.set({ workPage }));
      await transaction.commit();
      console.log("  set     showreel");
    }
  }
  console.log("\nDone. The site shows new pieces within five minutes: /work");
}

main().catch((error) => {
  console.error(`\n${error.message}`);
  process.exit(1);
});

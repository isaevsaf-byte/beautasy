// Bea's factory: one episode file in, a finished Reel and a Studio draft out.
//
//   node scripts/bea.mjs voice  <id>          record Lily, measure every word
//   node scripts/bea.mjs render <id>          film + loudness + cover
//   node scripts/bea.mjs stills <id> [s ...]  quick frames to look at (seconds)
//   node scripts/bea.mjs studio <id>          upload as a draft post, AI label ticked
//   node scripts/bea.mjs make   <id>          voice (if missing) + render
//
// The episode lives in episodes/<id>.json (see src/bea/episode/types.ts).
// Keys come from ../.env.local: ELEVENLABS_API_KEY for the voice,
// SANITY_API_WRITE_TOKEN for the Studio. Nothing is ever published from here:
// a draft waits in "Посты на одобрение" until Kristina approves it.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LILY = "pFZP5JQG7iQjIQuC4Bku";

const env = Object.fromEntries(
  readFileSync(join(ROOT, "..", ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
    }),
);

const [cmd, id, ...rest] = process.argv.slice(2);
if (!cmd || !id) {
  console.error("usage: node scripts/bea.mjs <voice|render|stills|studio|make> <episode-id>");
  process.exit(1);
}
const episodePath = join(ROOT, "episodes", `${id}.json`);
const episode = JSON.parse(readFileSync(episodePath, "utf8"));
if (episode.id !== id) throw new Error(`episodes/${id}.json says its id is "${episode.id}"`);
const voiceDir = join(ROOT, "public", "bea", "episodes", id);
const timingPath = join(voiceDir, "timing.json");
// Lily's take as recorded; voice.mp3 and timing.json are this with the pauses cut in
const takePath = join(voiceDir, "take.mp3");
const takeTimingPath = join(voiceDir, "take.json");
const out = (name) => join(ROOT, "out", name);
const run = (bin, args) => execFileSync(bin, args, { cwd: ROOT, stdio: ["ignore", "inherit", "inherit"] });

async function voice() {
  if (!env.ELEVENLABS_API_KEY) throw new Error("ELEVENLABS_API_KEY is not in .env.local");
  const said = episode.lines.map((l) => l.say ?? l.text);
  const text = said.join(" ");
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${LILY}/with-timestamps?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": env.ELEVENLABS_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      model_id: "eleven_multilingual_v2",
      voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.3, use_speaker_boost: true },
    }),
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const { characters, character_start_times_seconds: starts, character_end_times_seconds: ends } = data.alignment;
  if (characters.join("") !== text) throw new Error("ElevenLabs aligned a different text than it was given");

  // Each line's characters in the joined take, and its words with their times
  let offset = 0;
  const lines = said.map((line) => {
    const from = offset;
    const to = offset + line.length; // exclusive
    offset = to + 1;
    const words = [];
    let w = null;
    for (let i = from; i < to; i++) {
      if (characters[i] === " ") {
        if (w) words.push(w);
        w = null;
        continue;
      }
      if (!w) w = { text: "", start: starts[i], end: ends[i] };
      w.text += characters[i];
      w.end = ends[i];
    }
    if (w) words.push(w);
    return { start: words[0].start, end: words[words.length - 1].end, words };
  });
  mkdirSync(voiceDir, { recursive: true });
  writeFileSync(takePath, Buffer.from(data.audio_base64, "base64"));
  const timing = { duration: ends[ends.length - 1], lines };
  writeFileSync(takeTimingPath, JSON.stringify(timing, null, 1));
  console.log(`voice: ${timing.duration.toFixed(2)} s, ${lines.length} lines, ${text.length} characters`);
  lines.forEach((l, i) => console.log(`  ${i}  ${l.start.toFixed(2)}–${l.end.toFixed(2)}  ${said[i]}`));
  pace();
}

// Cut each line's pause into the take as silence, halfway between it and the
// line before, and move every later word by as much. Runs before every render,
// so a pause can be changed in the episode file without recording again.
// Episodes recorded before takes were kept have only voice.mp3: left as they are.
function pace() {
  if (!existsSync(takeTimingPath)) return;
  const take = JSON.parse(readFileSync(takeTimingPath, "utf8"));
  const cuts = episode.lines
    .map((l, i) => (l.pause > 0 && i > 0 ? { at: (take.lines[i - 1].end + take.lines[i].start) / 2, pause: l.pause } : null))
    .filter(Boolean);
  const shift = (t) => t + cuts.filter((c) => c.at <= t).reduce((sum, c) => sum + c.pause, 0);
  const timing = {
    duration: shift(take.duration),
    lines: take.lines.map((l) => ({
      start: shift(l.start),
      end: shift(l.end),
      words: l.words.map((w) => ({ ...w, start: shift(w.start), end: shift(w.end) })),
    })),
  };
  const voicePath = join(voiceDir, "voice.mp3");
  if (!cuts.length) {
    run("ffmpeg", ["-v", "error", "-y", "-i", takePath, "-c", "copy", voicePath]);
  } else {
    const bounds = [0, ...cuts.map((c) => c.at)];
    const parts = [];
    const graph = [];
    bounds.forEach((from, k) => {
      const to = bounds[k + 1];
      graph.push(`[0]atrim=start=${from}${to !== undefined ? `:end=${to}` : ""},asetpts=PTS-STARTPTS,aformat=sample_rates=44100:channel_layouts=mono[s${k}]`);
      parts.push(`[s${k}]`);
      if (to !== undefined) {
        graph.push(`anullsrc=r=44100:cl=mono,atrim=duration=${cuts[k].pause}[z${k}]`);
        parts.push(`[z${k}]`);
      }
    });
    graph.push(`${parts.join("")}concat=n=${parts.length}:v=0:a=1[out]`);
    run("ffmpeg", ["-v", "error", "-y", "-i", takePath, "-filter_complex", graph.join(";"), "-map", "[out]", "-c:a", "libmp3lame", "-b:a", "192k", voicePath]);
  }
  writeFileSync(timingPath, JSON.stringify(timing, null, 1));
  if (cuts.length) console.log(`pace: ${cuts.map((c) => `${c.pause} s at ${c.at.toFixed(2)}`).join(", ")} → ${timing.duration.toFixed(2)} s`);
}

// The countdown's tick and the answer's bell, made once with ElevenLabs sound effects
// Also any the episode lists in "sfx": { "<file in public/bea/>": "what it sounds like" }
async function sfx() {
  const sounds = { ...(episode.sfx ?? {}) };
  if (episode.scenes.some((s) => s.type === "guess")) {
    sounds["sfx-tick.mp3"] = "a single soft wooden clock tick, close and dry, no reverb";
    sounds["sfx-ding.mp3"] = "one bright small brass shop bell ding with a light sparkle, short and cheerful";
  }
  for (const [name, text] of Object.entries(sounds)) {
    const path = join(ROOT, "public", "bea", name);
    if (existsSync(path)) continue;
    const res = await fetch("https://api.elevenlabs.io/v1/sound-generation", {
      method: "POST",
      headers: { "xi-api-key": env.ELEVENLABS_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ text, duration_seconds: name === "sfx-tick.mp3" ? 0.5 : 1.5, prompt_influence: 0.6 }),
    });
    if (!res.ok) throw new Error(`ElevenLabs sound ${name}: ${res.status} ${await res.text()}`);
    writeFileSync(path, Buffer.from(await res.arrayBuffer()));
    console.log(`sfx: public/bea/${name}`);
  }
}

function propsFile() {
  pace();
  if (!existsSync(timingPath)) throw new Error(`no voice yet: run "node scripts/bea.mjs voice ${id}"`);
  const timing = JSON.parse(readFileSync(timingPath, "utf8"));
  const path = out(`${id}.props.json`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({ episode, timing }));
  return path;
}

function render() {
  const props = propsFile();
  run("npx", ["remotion", "render", "src/index.ts", "BeaEpisode", out(`${id}-raw.mp4`), `--props=${props}`, "--log=error"]);
  run("ffmpeg", ["-v", "error", "-y", "-i", out(`${id}-raw.mp4`), "-c:v", "copy", "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-c:a", "aac", "-b:a", "192k", out(`${id}.mp4`)]);
  run("ffmpeg", ["-v", "error", "-y", "-ss", String(episode.post.cover), "-i", out(`${id}.mp4`), "-frames:v", "1", "-q:v", "2", out(`${id}-cover.jpg`)]);
  console.log(`render: out/${id}.mp4, cover out/${id}-cover.jpg`);
}

function stills() {
  const props = propsFile();
  const at = rest.length ? rest.map(Number) : [1.5];
  for (const s of at) {
    const frame = Math.round(s * 30);
    run("npx", ["remotion", "still", "src/index.ts", "BeaEpisode", out(`${id}-still-${s}.png`), `--props=${props}`, `--frame=${frame}`, "--scale=0.4", "--log=error"]);
  }
  console.log(`stills: ${at.map((s) => `out/${id}-still-${s}.png`).join(", ")}`);
}

async function studio() {
  const pid = env.NEXT_PUBLIC_SANITY_PROJECT_ID;
  const ds = env.NEXT_PUBLIC_SANITY_DATASET;
  const token = env.SANITY_API_WRITE_TOKEN;
  if (!pid || !ds || !token) throw new Error("Sanity project, dataset or write token missing from .env.local");
  const base = `https://${pid}.api.sanity.io/v2024-01-29`;
  const auth = { Authorization: `Bearer ${token}` };
  const docId = `bea-${id}`;

  // Never touch a post Kristina has already approved or that has gone out
  const q = encodeURIComponent(`*[_id == "${docId}"][0]{status}`);
  const existing = (await (await fetch(`${base}/data/query/${ds}?query=${q}`, { headers: auth })).json()).result;
  if (existing && existing.status !== "draft") throw new Error(`${docId} is "${existing.status}" in the Studio — not replacing it`);

  const upload = async (kind, path, type, name) => {
    const res = await fetch(`${base}/assets/${kind}/${ds}?filename=${encodeURIComponent(name)}`, {
      method: "POST",
      headers: { ...auth, "Content-Type": type },
      body: readFileSync(path),
    });
    if (!res.ok) throw new Error(`upload ${name}: ${res.status} ${await res.text()}`);
    return (await res.json()).document._id;
  };
  const video = await upload("files", out(`${id}.mp4`), "video/mp4", `bea-${id}.mp4`);
  const cover = await upload("images", out(`${id}-cover.jpg`), "image/jpeg", `bea-${id}-cover.jpg`);
  const doc = {
    _id: docId,
    _type: "socialPost",
    format: "reel",
    kind: episode.post.kind,
    image: { _type: "image", asset: { _type: "reference", _ref: cover } },
    video: { _type: "file", asset: { _type: "reference", _ref: video } },
    caption: episode.post.caption,
    hashtags: episode.post.hashtags,
    aiGenerated: true,
    pinToPinterest: false,
    status: "draft",
    source: "manual",
    createdAt: new Date().toISOString(),
  };
  const res = await fetch(`${base}/data/mutate/${ds}`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ mutations: [{ createOrReplace: doc }] }),
  });
  if (!res.ok) throw new Error(`Studio: ${res.status} ${await res.text()}`);
  console.log(`studio: ${docId} is waiting in «Посты на одобрение», AI label ticked`);
}

if (cmd === "voice") await voice();
else if (cmd === "render") {
  await sfx();
  render();
} else if (cmd === "stills") {
  await sfx();
  stills();
}
else if (cmd === "studio") await studio();
else if (cmd === "make") {
  if (!existsSync(timingPath) && !existsSync(takeTimingPath)) await voice();
  await sfx();
  render();
} else throw new Error(`unknown command "${cmd}"`);

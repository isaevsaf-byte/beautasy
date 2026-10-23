// Puts a finished Reel or photo into the Studio as a draft post, for Kristina to approve.
//
//   node --env-file=.env.local video/scripts/studio-post.mjs post.json
//
// post.json:
//   { "id": "reel-jeans-original-hem", "format": "reel" | "photo",
//     "video": "video/out/x.mp4", "cover": "video/out/x-cover.jpg",
//     "caption": "…", "hashtags": "#…", "kind": "process", "music": "…",
//     "aiGenerated": false }
//
// Nothing is published from here, and a post Kristina has already approved
// or that has gone out is never replaced. The video keeps its own sound: a
// Reel approved in the Studio goes out exactly as the file sounds; a trending
// track can only be added in the Instagram app (see the post's «Музыка»).
import { readFileSync } from "node:fs";
import { basename } from "node:path";

const env = process.env;
const [specPath] = process.argv.slice(2);
if (!specPath) {
  console.error("usage: node --env-file=.env.local video/scripts/studio-post.mjs post.json");
  process.exit(1);
}
const post = JSON.parse(readFileSync(specPath, "utf8"));
const pid = env.NEXT_PUBLIC_SANITY_PROJECT_ID;
const ds = env.NEXT_PUBLIC_SANITY_DATASET;
const token = env.SANITY_API_WRITE_TOKEN;
if (!pid || !ds || !token) throw new Error("Sanity project, dataset or write token missing — run with --env-file=.env.local");
const base = `https://${pid}.api.sanity.io/v2024-01-29`;
const auth = { Authorization: `Bearer ${token}` };

const query = async (q) => (await (await fetch(`${base}/data/query/${ds}?query=${encodeURIComponent(q)}`, { headers: auth })).json()).result;
const existing = await query(`*[_id == "${post.id}"][0]{status}`);
if (existing && existing.status !== "draft") throw new Error(`${post.id} is "${existing.status}" in the Studio — not replacing it`);

async function upload(kind, path, type) {
  const res = await fetch(`${base}/assets/${kind}/${ds}?filename=${encodeURIComponent(basename(path))}`, {
    method: "POST",
    headers: { ...auth, "Content-Type": type },
    body: readFileSync(path),
  });
  if (!res.ok) throw new Error(`upload ${path}: ${res.status} ${await res.text()}`);
  return (await res.json()).document._id;
}

const format = post.format ?? "reel";
const doc = {
  _id: post.id,
  _type: "socialPost",
  format,
  kind: post.kind ?? "process",
  image: { _type: "image", asset: { _type: "reference", _ref: await upload("images", post.cover, "image/jpeg") } },
  caption: post.caption,
  hashtags: post.hashtags,
  aiGenerated: post.aiGenerated === true,
  pinToPinterest: false,
  status: "draft",
  source: "manual",
  createdAt: new Date().toISOString(),
};
if (format === "reel") {
  doc.video = { _type: "file", asset: { _type: "reference", _ref: await upload("files", post.video, "video/mp4") } };
  if (post.music) doc.music = post.music;
}
const res = await fetch(`${base}/data/mutate/${ds}`, {
  method: "POST",
  headers: { ...auth, "Content-Type": "application/json" },
  body: JSON.stringify({ mutations: [{ createOrReplace: doc }] }),
});
if (!res.ok) throw new Error(`Studio: ${res.status} ${await res.text()}`);
console.log(JSON.stringify(await query(`*[_id == "${post.id}"][0]{_id, status, format, "video": video.asset->url, "cover": image.asset->url}`)));

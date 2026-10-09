// Full-page screenshots of the live site at phone size, for Bea to "walk" through.
//
//   node scripts/site_shots.mjs <out-dir> <path> [<path> ...]
//
// Starts headless Chrome with the DevTools protocol and talks to it over the
// WebSocket Node already has: no Puppeteer needed. Each page is opened as a
// 390 px iPhone (3x), the cookie banner answered "essential only" the way a
// visitor would, lazy images scrolled into view, then shot top to bottom.
// Headless Chrome says so in its user agent, so the visit is not counted as a
// person in the site's analytics.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SITE = "https://www.beautasy.co.uk";
const [outDir, ...paths] = process.argv.slice(2);
if (!outDir || paths.length === 0) {
  console.error("usage: node scripts/site_shots.mjs <out-dir> <path> [<path> ...]");
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

const port = 9333;
const chrome = spawn(CHROME, [
  "--headless=new",
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${mkdtempSync(join(tmpdir(), "bea-shots-"))}`,
  "--hide-scrollbars",
  "--no-first-run",
  "about:blank",
]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function debuggerUrl() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = list.find((t) => t.type === "page");
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(200);
  }
  throw new Error("Chrome did not start");
}

const ws = new WebSocket(await debuggerUrl());
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let seq = 0;
const pending = new Map();
ws.addEventListener("message", (e) => {
  const msg = JSON.parse(e.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
  }
});
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
const evaluate = async (expression) =>
  (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result.value;

const W = 390, H = 844, DPR = 3;
await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: DPR, mobile: true });
await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });

// Answer the cookie banner once, as "essential only", on the site's own origin
await send("Page.navigate", { url: SITE + "/" });
await sleep(4000);
await evaluate(`localStorage.setItem("beautasy-cookie-consent", "denied"); true`);

for (const path of paths) {
  await send("Page.navigate", { url: SITE + path });
  await sleep(5000);
  // Walk down the page so lazy images load, then back to the top
  await evaluate(`(async () => {
    const step = innerHeight * 0.8;
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) { scrollTo(0, y); await new Promise(r => setTimeout(r, 350)); }
    scrollTo(0, 0); await new Promise(r => setTimeout(r, 800)); return true;
  })()`);
  // A full-page shot prints fixed and sticky bars wherever they happen to be,
  // over the product's title. Pin the site header to the top of the page as
  // an ordinary block and hide the bars that only appear on scroll.
  await evaluate(`(() => {
    for (const el of document.querySelectorAll("body *")) {
      const cs = getComputedStyle(el);
      if (cs.position !== "fixed" && cs.position !== "sticky") continue;
      if (el.closest("header") || el.tagName === "HEADER") {
        el.style.setProperty("position", "relative", "important");
        el.style.setProperty("top", "0", "important");
        el.style.setProperty("transform", "none", "important");
      } else {
        el.style.setProperty("display", "none", "important");
      }
    }
    scrollTo(0, 0);
    return true;
  })()`);
  await sleep(600);
  const height = await evaluate(`Math.min(document.documentElement.scrollHeight, 6000)`);
  const shot = await send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: W, height, scale: 1 },
  });
  const name = path.replace(/^\/+|\/+$/g, "").replace(/[^a-z0-9]+/gi, "-") || "home";
  writeFileSync(join(outDir, `${name}.png`), Buffer.from(shot.data, "base64"));
  console.log(`${name}.png  ${W}x${height} css px`);
}

ws.close();
chrome.kill();

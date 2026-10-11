import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sanityClient } from "../../lib/sanity";
import { SITE_URL } from "../../lib/site";
import { workFrom } from "../../lib/work";
import { workCardImages } from "../../lib/workCardVersion";
import WorkPiecePage, { generateMetadata, generateStaticParams, revalidate } from "./[piece]/page";
import WorkPageContent from "./WorkPageContent";
import { GALLERY_TITLE, addressOf, pieceIn, pieceTitle } from "../../components/work/pieceAddress";

/**
 * A piece of work at an address of its own, /work/<piece> (11.10.2026): what
 * a chat app reads there, where it leads, and the gallery's button that sends
 * it. Before, a piece could only be sent as /work#<piece>, and a chat app
 * never sends the part after # — every piece previewed as the newest one.
 */

const RAW = {
  pieces: [
    {
      id: "workPiece-grey-eyelet-curtains",
      title: "Lined eyelet curtains, taken up",
      caption: "Too long and pooling on the floor. Measured, taken up and rehung.",
      category: "home",
      date: "2026-09-27",
      before: { key: "before", kind: "photo", image: { asset: { _ref: "image-before-1800x2400-jpg" } }, width: 1800, height: 2400 },
      media: [{ key: "a", kind: "photo", image: { asset: { _ref: "image-after-1800x2400-jpg" } }, width: 1800, height: 2400 }],
    },
    {
      id: "workPiece-closed-up-by-hand",
      title: "Closed up by hand",
      category: "accessories",
      date: "2026-09-20",
      media: [{ key: "b", kind: "photo", image: { asset: { _ref: "image-red-1800x2400-jpg" } }, width: 1800, height: 2400 }],
    },
  ],
  showreel: null,
};

const params = (piece: string) => ({ params: Promise.resolve({ piece }) });
const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");

test("each piece has its address, and a chat app reading it gets that piece's card and caption", async (t) => {
  t.mock.method(sanityClient, "fetch", async () => RAW);
  assert.equal(revalidate, 300, "a piece Kristina publishes can be sent within five minutes, as /work shows it");
  assert.deepEqual(await generateStaticParams(), [{ piece: "grey-eyelet-curtains" }, { piece: "closed-up-by-hand" }]);

  const meta = await generateMetadata(params("grey-eyelet-curtains"));
  const [eyelet] = workFrom(RAW).pieces;
  // Its own canonical, so no scraper is sent on to the gallery's card; not
  // listed, as it is the gallery under another address
  assert.equal(meta.alternates?.canonical, `${SITE_URL}/work/grey-eyelet-curtains`);
  assert.deepEqual(meta.robots, { index: false, follow: true });
  assert.equal(meta.title, "Lined eyelet curtains, taken up — Made & Mended | Beautasy Atelier, Southampton");
  assert.equal(meta.description, "Too long and pooling on the floor. Measured, taken up and rehung.");
  const og = meta.openGraph as Record<string, unknown>;
  // Facebook reads og:url as the page to describe: /work would show the gallery's card again
  assert.equal(og.url, `${SITE_URL}/work/grey-eyelet-curtains`);
  assert.equal(og.title, "Lined eyelet curtains, taken up | Beautasy Atelier, Southampton");
  assert.deepEqual(og.images, workCardImages(eyelet, "grey-eyelet-curtains"));
  assert.deepEqual((meta.twitter as Record<string, unknown>).images, [workCardImages(eyelet, "grey-eyelet-curtains")[0].url]);
});

test("the page is the gallery, and a piece taken down sends its link to the gallery", async (t) => {
  t.mock.method(sanityClient, "fetch", async () => RAW);
  const page = (await WorkPiecePage(params("closed-up-by-hand"))) as { type: unknown; props: object };
  assert.equal(page.type, WorkPageContent);
  assert.deepEqual(page.props, {}, "the gallery opens the piece from the address, nothing else");
  await assert.rejects(WorkPiecePage(params("taken-down")), (error: { digest?: string }) => {
    assert.match(String(error.digest), /^NEXT_REDIRECT;[a-z]+;\/work;/);
    return true;
  });
  assert.deepEqual(await generateMetadata(params("taken-down")), { robots: { index: false, follow: true } });
});

test("an open piece is its own address, and the older #-links still open theirs", () => {
  assert.equal(pieceIn("/work/grey-eyelet-curtains", ""), "grey-eyelet-curtains");
  assert.equal(pieceIn("/work/grey-eyelet-curtains/", ""), "grey-eyelet-curtains");
  assert.equal(pieceIn("/work", "#grey-eyelet-curtains"), "grey-eyelet-curtains");
  assert.equal(pieceIn("/work/", "#grey-eyelet-curtains"), "grey-eyelet-curtains");
  assert.equal(pieceIn("/work/closed-up-by-hand", "#grey-eyelet-curtains"), "closed-up-by-hand", "the path is the piece");
  assert.equal(pieceIn("/work", ""), "");
  assert.equal(pieceIn("/work", "#gallery"), "gallery", "the hero's jump to the grid names no piece, so opens none");
  assert.equal(pieceIn("/atelier", "#grey-eyelet-curtains"), "", "a hash elsewhere is not a piece");
  assert.equal(pieceIn("/work/a/b", ""), "");
  assert.equal(pieceIn("/work/%E0%A4%A", ""), "", "an address that won't decode opens nothing");
  assert.equal(addressOf("grey-eyelet-curtains"), "/work/grey-eyelet-curtains");
  assert.equal(addressOf("a b"), "/work/a%20b");
  assert.equal(addressOf(null), "/work");
  for (const anchor of ["grey-eyelet-curtains", "3f1c2b8e-9a1d", "a b"]) assert.equal(pieceIn(addressOf(anchor), ""), anchor);
});

test("the gallery reads and writes the piece's own address, and a tile elsewhere links to it", () => {
  const gallery = read("src/components/work/WorkGallery.tsx");
  assert.match(gallery, /function readPiece\(\): string \{\s+return pieceIn\(window\.location\.pathname, window\.location\.hash\);/);
  assert.match(gallery, /const url = `\$\{addressOf\(anchor\)\}\$\{window\.location\.search\}`;/);
  assert.match(gallery, /useSyncExternalStore\(subscribe, readPiece, \(\) => ""\)/);
  // An older /work#<piece> is rewritten, but only when it names a piece: #gallery is the hero's jump
  assert.match(gallery, /if \(pieces\.some\(\(p\) => p\.anchor === anchor\)\) writeAddress\(anchor, false\);/);
  assert.doesNotMatch(gallery, /#\$\{encodeURIComponent/, "no piece is written after a # any more");
  assert.match(read("src/components/work/WorkStrip.tsx"), /href=\{addressOf\(piece\.anchor\)\}/);
  assert.doesNotMatch(read("src/app/work/WorkPageContent.tsx"), /opened/);
  // The tab's title moves with the address, in the words each page's metadata uses
  assert.match(gallery, /document\.title = openTitle \? pieceTitle\(openTitle\) : GALLERY_TITLE;/);
  assert.match(read("src/app/work/page.tsx"), /const TITLE = GALLERY_TITLE;/);
  assert.match(read("src/app/work/[piece]/page.tsx"), /title: pieceTitle\(piece\.title\),/);
  assert.equal(pieceTitle("Closed up by hand"), "Closed up by hand — Made & Mended | Beautasy Atelier, Southampton");
  assert.equal(GALLERY_TITLE, "Made & Mended — Our Work | Beautasy Atelier, Southampton");
});

test("the viewer sends a piece by its own address: the share sheet, the link copied, or WhatsApp", () => {
  const viewer = read("src/components/work/WorkViewer.tsx");
  assert.match(viewer, /<SendToFriend piece=\{piece\} \/>/);
  assert.match(viewer, /const url = `\$\{SITE_URL\}\$\{addressOf\(piece\.anchor\)\}`;/);
  assert.match(viewer, /typeof navigator\.share === "function" && \(navigator\.canShare\?\.\(\{ url \}\) \?\? true\)/);
  assert.match(viewer, /await navigator\.share\(\{ title: piece\.title, url \}\);\s+return;/);
  assert.match(viewer, /error instanceof DOMException && error\.name === "AbortError"\) return;/, "closing the sheet is not a failure");
  assert.match(viewer, /await navigator\.clipboard\.writeText\(url\);\s+setCopied\(true\);/);
  assert.match(viewer, /window\.open\(`https:\/\/wa\.me\/\?text=\$\{encodeURIComponent\(url\)\}`, "_blank", "noopener,noreferrer"\);/);
  // Announced once, by a status of its own, not by the button's words changing back
  assert.match(viewer, /<span role="status" className="sr-only">\s+\{copied \? "Link copied" : ""\}\s+<\/span>/);
  assert.doesNotMatch(viewer, /aria-live/);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { anchorFor, shareImageFor, showPiece, srcSetFor, widthsFor, workJsonLd } from "./workMedia";
import type { WorkPhoto, WorkPiece, WorkVideo } from "./work";

const photo = (ref: string, extra: Partial<WorkPhoto> = {}): WorkPhoto => ({
  kind: "photo",
  key: ref,
  alt: null,
  image: { asset: { _ref: `image-${ref}-960x1280-jpg` } },
  width: 960,
  height: 1280,
  lqip: null,
  ...extra,
});

const video = (extra: Partial<WorkVideo> = {}): WorkVideo => ({
  kind: "video",
  key: "v",
  alt: "Shears through red fabric",
  url: "https://cdn.sanity.io/files/p/production/film.mp4",
  width: 720,
  height: 1316,
  duration: 16.6,
  poster: { asset: { _ref: "image-cover-1080x1974-jpg" } },
  lqip: null,
  ...extra,
});

const piece = (extra: Partial<WorkPiece> = {}): WorkPiece => ({
  id: "workPiece-doorway-curtains",
  title: "Curtains taken up",
  caption: "Before and after.",
  category: "home",
  service: null,
  shelf: null,
  date: "2026-09-27",
  before: null,
  media: [photo("after")],
  ...extra,
});

test("the browser is offered sizes up to the photo's own width, and never beyond it", () => {
  assert.deepEqual(widthsFor(960), [320, 480, 640, 800, 960]);
  assert.deepEqual(widthsFor(800), [320, 480, 640, 800]);
  assert.deepEqual(widthsFor(3024), [320, 480, 640, 800, 1080, 1440]);
  assert.deepEqual(widthsFor(300), [300]);
});

test("each size is asked of Sanity's CDN, in whatever format the browser takes", () => {
  const set = srcSetFor({ asset: { _ref: "image-abc-960x1280-jpg" } }, 960).split(", ");
  assert.equal(set.length, 5);
  assert.match(set[0], /^https:\/\/cdn\.sanity\.io\/images\/[^/]+\/[^/]+\/abc-960x1280\.jpg\?w=320&q=80&fit=max&auto=format 320w$/);
  assert.match(set[4], /\?w=960&.* 960w$/);
});

test("a piece gets its address on /work, and ids made in the Studio keep theirs", () => {
  assert.equal(anchorFor("workPiece-doorway-curtains"), "doorway-curtains");
  assert.equal(anchorFor("workPiece.doorway-curtains"), "doorway-curtains");
  assert.equal(anchorFor("3f1c2b8e-9a1d-4c2b-8f00-1a2b3c4d5e6f"), "3f1c2b8e-9a1d-4c2b-8f00-1a2b3c4d5e6f");
  assert.equal(anchorFor("odd id/with:things"), "odd-id-with-things");
});

test("every picture has words for someone who can't see it, even when none were written", () => {
  const shown = showPiece(
    piece({
      before: photo("before"),
      media: [photo("after"), photo("detail", { alt: "The new hem" }), video({ alt: null })],
    })
  );
  assert.equal(shown.before?.alt, "Curtains taken up — before");
  assert.equal(shown.media[0].alt, "Curtains taken up — after");
  assert.equal(shown.media[1].alt, "The new hem");
  assert.equal(shown.media[2].alt, "Curtains taken up");
  assert.equal(showPiece(piece()).media[0].alt, "Curtains taken up", "no before: the cover is not called an after");
});

test("a piece names its service page as that page's card does, and drops one that has gone", () => {
  assert.deepEqual(showPiece(piece({ service: "curtains-and-home-southampton" })).service, {
    slug: "curtains-and-home-southampton",
    title: "Curtain Alterations & Home Textiles",
  });
  assert.equal(showPiece(piece({ service: "a-page-that-was-removed" })).service, null);
  assert.equal(showPiece(piece()).categoryLabel, "Curtains & home");
});

test("a video keeps its own address, with a cover the browser can size", () => {
  const shown = showPiece(piece({ media: [video()] })).media[0];
  assert.equal(shown.kind, "video");
  if (shown.kind !== "video") return;
  assert.equal(shown.src, "https://cdn.sanity.io/files/p/production/film.mp4");
  assert.match(shown.poster ?? "", /cover-1080x1974\.jpg\?w=800/);
  assert.match(shown.posterSrcSet ?? "", / 1080w$/);
  const bare = showPiece(piece({ media: [video({ poster: null })] })).media[0];
  assert.equal(bare.kind === "video" && bare.poster, null);
});

test("a shared link shows the newest piece's cover, cropped to a link card", () => {
  assert.match(shareImageFor(piece()) ?? "", /after-960x1280\.jpg\?rect=.*&w=1200&h=630/);
  assert.match(shareImageFor(piece({ media: [video()] })) ?? "", /cover-1080x1974\.jpg\?.*w=1200&h=630/);
  assert.equal(shareImageFor(piece({ media: [video({ poster: null })] })), null);
  assert.equal(shareImageFor(undefined), null);
});

test("search engines hear of every photograph, and of each film that has a cover", () => {
  const pieces = [
    showPiece(piece({ before: photo("before") })),
    showPiece(
      piece({
        id: "workPiece-film",
        title: "Cutting",
        media: [video(), video({ key: "w", poster: null }), video({ key: "x", duration: 65 })],
      })
    ),
  ];
  const ld = workJsonLd(pieces, "https://www.beautasy.co.uk/work", "https://www.beautasy.co.uk/alterations#business");
  assert.equal(ld["@type"], "CollectionPage");
  assert.deepEqual(ld.about, { "@id": "https://www.beautasy.co.uk/alterations#business" });
  assert.equal(ld.mainEntity.associatedMedia.length, 2, "the before and the after");
  assert.equal(ld.mainEntity.associatedMedia[0].caption, "Curtains taken up — before");
  const cover = pieces[1].media[0].kind === "video" ? pieces[1].media[0].poster : null;
  assert.deepEqual(ld.hasPart, [
    {
      "@type": "VideoObject",
      name: "Cutting (1)",
      description: "Before and after.",
      thumbnailUrl: [cover],
      contentUrl: "https://cdn.sanity.io/files/p/production/film.mp4",
      uploadDate: "2026-09-27",
      duration: "PT17S",
    },
    {
      "@type": "VideoObject",
      name: "Cutting (2)",
      description: "Before and after.",
      thumbnailUrl: [cover],
      contentUrl: "https://cdn.sanity.io/files/p/production/film.mp4",
      uploadDate: "2026-09-27",
      duration: "PT1M5S",
    },
  ], "the film without a cover is not listed, and not counted");
  const photosOnly = workJsonLd([pieces[0]], "u", "b");
  assert.equal("hasPart" in photosOnly, false);
});

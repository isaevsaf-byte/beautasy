import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluate, parse } from "groq-js";
import {
  WORK_CATEGORIES,
  WORK_QUERY,
  WORK_SHELVES,
  atelierPieces,
  categoriesIn,
  durationLabel,
  isBeforeAfter,
  isoDuration,
  piecesForService,
  shelfCta,
  workFrom,
  type WorkPiece,
} from "./work";
import { placeLink } from "./shelves";

const image = (id: string, width = 960, height = 1280) => ({
  _id: id,
  _type: "sanity.imageAsset",
  url: `https://cdn.sanity.io/images/p/production/${id}.jpg`,
  metadata: { dimensions: { width, height }, lqip: `data:image/jpeg;base64,${id}` },
});

const photo = (key: string, ref: string, alt?: string) => ({
  _key: key,
  _type: "workPhoto",
  asset: { _type: "reference", _ref: ref },
  ...(alt ? { alt } : {}),
});

const DATASET = [
  image("image-after"),
  image("image-before"),
  image("image-wide", 1280, 960),
  { _id: "file-film", _type: "sanity.fileAsset", url: "https://cdn.sanity.io/files/p/production/film.mp4" },
  {
    _id: "workPiece-curtains",
    _type: "workPiece",
    _createdAt: "2026-09-27T10:00:05Z",
    date: "2026-09-27",
    title: "Curtains taken up",
    caption: "Before and after.",
    category: "home",
    service: "curtains-and-home-southampton",
    before: { _type: "image", asset: { _type: "reference", _ref: "image-before" }, alt: "Too long" },
    media: [photo("m0", "image-after", "Just right")],
  },
  {
    _id: "workPiece-film",
    _type: "workPiece",
    _createdAt: "2026-09-27T10:00:01Z",
    date: "2026-09-27",
    title: "Cutting",
    category: "workroom",
    media: [
      {
        _key: "v0",
        _type: "workVideo",
        file: { _type: "file", asset: { _type: "reference", _ref: "file-film" } },
        poster: { _type: "image", asset: { _type: "reference", _ref: "image-after" } },
        alt: "Shears through red fabric",
        width: 720,
        height: 1316,
        duration: 16.6,
      },
      // Something the schema doesn't know any more: left out, not drawn empty
      { _key: "x0", _type: "somethingElse", text: "?" },
    ],
  },
  {
    // Created later, but dated earlier: the date decides
    _id: "workPiece-pouch",
    _type: "workPiece",
    _createdAt: "2026-09-27T11:00:00Z",
    date: "2026-09-01",
    title: "Pouch",
    category: "accessories",
    shelf: "/shop/accessories?category=pouches",
    media: [photo("m0", "image-wide")],
  },
  {
    _id: "workPiece-undated",
    _type: "workPiece",
    _createdAt: "2026-08-01T09:00:00Z",
    title: "Undated",
    category: "made",
    media: [photo("m0", "image-after")],
  },
  { _id: "workPiece-empty", _type: "workPiece", _createdAt: "2026-09-27T12:00:00Z", title: "Nothing yet", media: [] },
  { _id: "workPiece-untitled", _type: "workPiece", _createdAt: "2026-09-27T12:00:00Z", media: [photo("m0", "image-after")] },
  {
    _id: "siteSettings",
    _type: "siteSettings",
    workPage: {
      showreel: { _type: "file", asset: { _type: "reference", _ref: "file-film" } },
      showreelPoster: { _type: "image", asset: { _type: "reference", _ref: "image-after" } },
    },
  },
];

async function query(dataset: unknown[] = DATASET) {
  return workFrom(await (await evaluate(parse(WORK_QUERY), { dataset })).get());
}

test("the query reads every finished piece, newest first by its date", async () => {
  const { pieces } = await query();
  assert.deepEqual(
    pieces.map((p) => p.id),
    ["workPiece-curtains", "workPiece-film", "workPiece-pouch", "workPiece-undated"],
    "same date: the later created first; an earlier date after; no date: the day it was made"
  );
});

test("a piece arrives with what the page needs to draw it before anything loads", async () => {
  const { pieces } = await query();
  const curtains = pieces[0];
  assert.equal(curtains.title, "Curtains taken up");
  assert.equal(curtains.category, "home");
  assert.equal(curtains.service, "curtains-and-home-southampton");
  assert.equal(curtains.date, "2026-09-27");
  assert.deepEqual(curtains.before, {
    kind: "photo",
    key: "before",
    alt: "Too long",
    image: { asset: { _type: "reference", _ref: "image-before" }, hotspot: null, crop: null },
    width: 960,
    height: 1280,
    lqip: "data:image/jpeg;base64,image-before",
  });
  assert.equal(curtains.media[0].kind, "photo");
  assert.equal(curtains.media[0].alt, "Just right");

  const film = pieces[1];
  assert.equal(film.media.length, 1, "the unknown member is dropped");
  assert.deepEqual(film.media[0], {
    kind: "video",
    key: "v0",
    alt: "Shears through red fabric",
    url: "https://cdn.sanity.io/files/p/production/film.mp4",
    width: 720,
    height: 1316,
    duration: 16.6,
    poster: { asset: { _type: "reference", _ref: "image-after" }, hotspot: null, crop: null },
    lqip: "data:image/jpeg;base64,image-after",
  });

  assert.equal(pieces[2].shelf, "/shop/accessories?category=pouches");
  assert.equal(pieces[3].date, "2026-08-01T09:00:00Z", "no date: the day it was created");
});

test("the showreel comes from Site Settings, and is simply absent when not set", async () => {
  const { showreel } = await query();
  assert.equal(showreel?.url, "https://cdn.sanity.io/files/p/production/film.mp4");
  assert.equal(showreel?.poster?.asset._ref, "image-after");

  const without = await query(DATASET.filter((d) => d._id !== "siteSettings"));
  assert.equal(without.showreel, null);
  assert.equal(without.pieces.length, 4);
});

test("half-filled pieces from the Studio are left out rather than drawn as empty frames", () => {
  const { pieces } = workFrom({
    pieces: [
      // A photo slot with no photo chosen yet, and a video still uploading
      {
        id: "a",
        title: "Half done",
        category: "home",
        media: [
          { kind: "photo", key: "p", image: { asset: null }, width: null, height: null },
          { kind: "video", key: "v", url: null },
        ],
      },
      { id: "b", title: "  ", category: "home", media: [{ kind: "photo", key: "p", image: { asset: { _ref: "x" } }, width: 1, height: 1 }] },
      // Sizes without a picture — a malformed answer, not something the query makes
      {
        id: "d",
        title: "No picture",
        category: "home",
        media: [{ kind: "photo", key: "p", image: { asset: null }, width: 10, height: 20 }],
      },
      {
        id: "c",
        title: "Fine",
        category: "not-a-category",
        caption: "  ",
        before: { kind: "photo", key: "before", image: { asset: null }, width: null, height: null },
        media: [{ kind: "photo", key: "p", image: { asset: { _ref: "x" } }, width: 10, height: 20 }],
      },
    ],
  });
  assert.deepEqual(
    pieces.map((p) => p.id),
    ["c"],
    "a piece with nothing to show, or no title, is not a piece"
  );
  assert.equal(pieces[0].category, "workroom", "an unknown category still lands somewhere");
  assert.equal(pieces[0].caption, null);
  assert.equal(pieces[0].before, null, "an empty before-slot is no before");
});

test("a video added by hand, with nothing recorded about it, is laid out as a phone films", () => {
  const { pieces } = workFrom({
    pieces: [{ id: "v", title: "By hand", category: "workroom", media: [{ kind: "video", key: "k", url: "https://x/v.mp4" }] }],
  });
  assert.deepEqual(pieces[0].media[0], {
    kind: "video",
    key: "k",
    alt: null,
    url: "https://x/v.mp4",
    width: 9,
    height: 16,
    duration: null,
    poster: null,
    lqip: null,
  });
});

test("nothing to read is an empty gallery, not a crash", () => {
  assert.deepEqual(workFrom(null), { pieces: [], showreel: null });
  assert.deepEqual(workFrom({ pieces: null, showreel: { url: null } }), { pieces: [], showreel: null });
});

const piece = (id: string, category: WorkPiece["category"], extra: Partial<WorkPiece> = {}): WorkPiece => ({
  id,
  title: id,
  caption: null,
  category,
  service: null,
  shelf: null,
  date: "2026-09-27",
  before: null,
  media: [{ kind: "photo", key: "k", alt: null, image: { asset: { _ref: "x" } }, width: 3, height: 4, lqip: null }],
  ...extra,
});

test("the filters are only the categories with something in them, in the fixed order", () => {
  const pieces = [piece("a", "workroom"), piece("b", "home"), piece("c", "workroom"), piece("d", "accessories")];
  assert.deepEqual(categoriesIn(pieces), [
    { value: "home", label: "Curtains & home", count: 1 },
    { value: "accessories", label: "Accessories", count: 1 },
    { value: "workroom", label: "Behind the seams", count: 2 },
  ]);
  assert.deepEqual(categoriesIn([]), []);
});

test("a service page gets its own jobs; the atelier page the newest from its side of the room", () => {
  const pieces = [
    piece("scrunchies", "accessories"),
    piece("curtains", "home", { service: "curtains-and-home-southampton" }),
    piece("quilt", "made"),
    piece("knickers", "kids"),
    piece("cutting", "workroom"),
    piece("jeans", "alterations", { service: "jeans-and-trousers-southampton" }),
  ];
  assert.deepEqual(
    piecesForService(pieces, "curtains-and-home-southampton").map((p) => p.id),
    ["curtains"]
  );
  assert.deepEqual(piecesForService(pieces, "wedding-dress-southampton"), []);
  assert.deepEqual(
    atelierPieces(pieces, 3).map((p) => p.id),
    ["curtains", "quilt", "cutting"],
    "the shop's own pieces have the shop"
  );
});

test("a before and an after is a pair only when the after is a photo", () => {
  const before = { kind: "photo" as const, key: "b", alt: null, image: { asset: { _ref: "b" } }, width: 3, height: 4, lqip: null };
  assert.equal(isBeforeAfter(piece("a", "home", { before })), true);
  assert.equal(isBeforeAfter(piece("b", "home")), false);
  assert.equal(
    isBeforeAfter(
      piece("c", "home", {
        before,
        media: [{ kind: "video", key: "v", alt: null, url: "u", width: 9, height: 16, duration: 3, poster: null, lqip: null }],
      })
    ),
    false
  );
});

test("durations read as a player shows them, and as schema.org wants them", () => {
  assert.equal(durationLabel(14.2), "0:14");
  assert.equal(durationLabel(24.7), "0:25");
  assert.equal(durationLabel(65), "1:05");
  assert.equal(durationLabel(0.3), "0:01", "never 0:00");
  assert.equal(isoDuration(14.2), "PT14S");
  assert.equal(isoDuration(65), "PT1M5S");
  assert.equal(isoDuration(120), "PT2M");
  assert.equal(isoDuration(0.3), "PT1S");
});

test("every shop link a piece can have is a real shelf, with words for its button", () => {
  const stocked = {
    stocked: [
      "Accessories",
      "Accessories/hair-accessories",
      "Accessories/pouches",
      "Accessories/sleeping-masks",
      "Kids",
      "Kids/underwear",
      "Lingerie",
      "Home",
    ],
    giftBoxes: false,
  };
  for (const shelf of WORK_SHELVES) {
    assert.equal(placeLink(shelf.value, stocked), shelf.value, `${shelf.value} is a shop link placeLink understands`);
    assert.equal(shelfCta(shelf.value), shelf.cta);
  }
  assert.equal(placeLink("/shop/accessories?category=pouches", { stocked: ["Kids"], giftBoxes: false }), null);
  assert.equal(shelfCta("/somewhere-else"), null);
});

test("the shop shelves a piece can point to are the ones the shop has", () => {
  assert.deepEqual(
    WORK_SHELVES.map((s) => s.value),
    [
      "/shop/accessories?category=hair-accessories",
      "/shop/accessories?category=pouches",
      "/shop/accessories?category=sleeping-masks",
      "/shop/kids?category=underwear",
      "/shop/kids",
      "/shop/lingerie",
      "/shop/home",
      "/gift-cards",
    ]
  );
});

test("the categories are the ones the Studio offers", () => {
  assert.deepEqual(
    WORK_CATEGORIES.map((c) => c.value),
    ["alterations", "home", "made", "kids", "accessories", "workroom"]
  );
});

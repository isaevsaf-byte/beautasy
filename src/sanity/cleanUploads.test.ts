import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import type { AssetSource, AssetSourceUploadEvent, AssetSourceUploader } from "sanity";
import { carriesLocation } from "@/lib/photoLocation";
import { cleanForUpload, onLocationNotice, withLocationStripped, type CleanedUpload, type LocationNotice } from "./cleanUploads";

/**
 * A photo uploaded in the Studio is public the moment it lands, so its
 * location is taken out in the browser, before the upload. Node has no
 * canvas: where the Studio would redraw a photo, these tests hand in a redraw
 * made with sharp, and check what the Studio does with its answer.
 */

const canvas = () => sharp({ create: { width: 48, height: 36, channels: 3, background: "#dcd0ff" } });
const WHERE = {
  IFD3: { GPSLatitudeRef: "N", GPSLatitude: "50/1 54/1 3/1", GPSLongitudeRef: "W", GPSLongitude: "1/1 24/1 5/1" },
};

const asFile = (bytes: Uint8Array | Buffer, name: string, type: string) => new File([new Uint8Array(bytes)], name, { type });
const bytesOf = async (file: Blob) => new Uint8Array(await file.arrayBuffer());

const locatedJpeg = async () => asFile(await canvas().withExif(WHERE).withMetadata({ orientation: 6 }).jpeg().toBuffer(), "IMG_0001.jpg", "image/jpeg");
const cleanJpeg = async () => asFile(await canvas().withExif({ IFD0: { Make: "Apple" } }).jpeg().toBuffer(), "IMG_0002.jpg", "image/jpeg");
const locatedPng = async () => asFile(await canvas().withExif(WHERE).png().toBuffer(), "screen.png", "image/png");

/** What a canvas does: the pixels again, upright, and nothing else */
const sharpRedraw = async (file: File) =>
  asFile(await sharp(await bytesOf(file)).rotate().jpeg({ quality: 92 }).toBuffer(), "redrawn.jpg", "image/jpeg");
const cannotOpen = async (): Promise<File> => {
  throw new Error("The browser can't decode this");
};

test("a photo without a location goes up as the very same file", async () => {
  const file = await cleanJpeg();
  const result = await cleanForUpload(file, cannotOpen);
  assert.equal(result.kind, "untouched");
  assert.equal(result.file, file);
});

test("a located JPEG loses its location without being redrawn: same name, same pixels, still turned", async () => {
  const file = await locatedJpeg();
  const result = await cleanForUpload(file, cannotOpen);
  assert.equal(result.kind, "cleaned");
  assert.equal(result.file.name, "IMG_0001.jpg");
  assert.equal(result.file.type, "image/jpeg");
  const bytes = await bytesOf(result.file);
  assert.equal(carriesLocation(bytes), false);
  assert.ok((await sharp(bytes).raw().toBuffer()).equals(await sharp(await bytesOf(file)).raw().toBuffer()));
  assert.equal((await sharp(bytes).metadata()).orientation, 6);
});

test("a located PNG is redrawn, and the redraw is what goes up", async () => {
  const result = await cleanForUpload(await locatedPng(), sharpRedraw);
  assert.equal(result.kind, "cleaned");
  assert.equal(result.file.name, "redrawn.jpg");
  assert.equal(carriesLocation(await bytesOf(result.file)), false);
});

test("a located JPEG with a located picture after it is redrawn rather than half-cleaned", async () => {
  const tail = await bytesOf(await locatedJpeg());
  const head = await bytesOf(await cleanJpeg());
  const result = await cleanForUpload(asFile(new Uint8Array([...head, ...tail]), "IMG_0003.jpg", "image/jpeg"), sharpRedraw);
  assert.equal(result.kind, "cleaned");
  assert.equal(result.file.name, "redrawn.jpg");
});

test("a located photo the browser can't clean is turned back, never sent as it is", async () => {
  assert.equal((await cleanForUpload(await locatedPng(), cannotOpen)).kind, "refused");
  // A redraw that somehow kept the location is not trusted either
  const keepsIt = async (file: File) => file;
  assert.equal((await cleanForUpload(await locatedPng(), keepsIt)).kind, "refused");
});

/* ─── The Uploader the Studio is handed ─── */

/** Stands in for Sanity's own dataset uploader and remembers what it was given */
class FakeUploader implements AssetSourceUploader {
  static made: FakeUploader[] = [];
  given: File[][] = [];
  constructor() {
    FakeUploader.made.push(this);
  }
  upload(files: File[]) {
    this.given.push(files);
    return [];
  }
  abort() {}
  getFiles() {
    return [];
  }
  subscribe() {
    return () => {};
  }
  updateFile() {}
  reset() {}
}

const source = { name: "sanity-default", component: () => null, Uploader: FakeUploader } as unknown as AssetSource;

/** A new wrapped uploader, with what it tells the Studio and what it tells Kristina */
function studio(clean?: (file: File) => Promise<CleanedUpload>) {
  const Uploader = withLocationStripped(source, clean).Uploader!;
  const uploader = new Uploader();
  const inner = FakeUploader.made.at(-1)!;
  const events: AssetSourceUploadEvent[] = [];
  uploader.subscribe((event) => events.push(event));
  const notices: LocationNotice[] = [];
  const stop = onLocationNotice((notice) => notices.push(notice));
  return { uploader, inner, events, notices, stop };
}

async function until(done: () => boolean) {
  for (let i = 0; i < 100 && !done(); i++) await new Promise((resolve) => setTimeout(resolve, 5));
}

test("the Studio's uploader hands on the cleaned file and says so, once", async (t) => {
  const { uploader, inner, notices, stop } = studio();
  t.after(stop);
  uploader.upload([await locatedJpeg()], { onChange: () => {} });
  await until(() => inner.given.length > 0);
  assert.equal(inner.given.length, 1);
  assert.equal(carriesLocation(await bytesOf(inner.given[0][0])), false);
  assert.deepEqual(notices, [{ kind: "cleaned", name: "IMG_0001.jpg" }]);
});

test("a photo without a location is handed on as it is, and nothing is said", async (t) => {
  const { uploader, inner, notices, stop } = studio();
  t.after(stop);
  const file = await cleanJpeg();
  uploader.upload([file]);
  await until(() => inner.given.length > 0);
  assert.equal(inner.given[0][0], file);
  assert.deepEqual(notices, []);
});

test("a refused photo never reaches Sanity, and the Studio's progress bar is cleared with an error", async (t) => {
  const refuse = async (file: File): Promise<CleanedUpload> => ({ kind: "refused", file });
  const { uploader, inner, events, notices, stop } = studio(refuse);
  t.after(stop);
  uploader.upload([await locatedPng()]);
  await until(() => events.length >= 2);
  assert.deepEqual(inner.given, []);
  assert.deepEqual(
    events.map((event) => event.type),
    ["error", "all-complete"],
  );
  assert.deepEqual(notices, [{ kind: "refused", name: "screen.png" }]);
});

test("a file that can't even be read is refused, not sent", async (t) => {
  const broken = async (): Promise<CleanedUpload> => {
    throw new Error("unreadable");
  };
  const { uploader, inner, notices, stop } = studio(broken);
  t.after(stop);
  uploader.upload([await locatedJpeg()]);
  await until(() => notices.length > 0);
  assert.deepEqual(inner.given, []);
  assert.equal(notices[0].kind, "refused");
});

test("cancelled while the photo was being read: nothing goes up", async (t) => {
  let release!: () => void;
  const slow = (file: File) => new Promise<CleanedUpload>((resolve) => (release = () => resolve({ kind: "untouched", file })));
  const { uploader, inner, stop } = studio(slow);
  t.after(stop);
  uploader.upload([await cleanJpeg()]);
  uploader.abort();
  release();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(inner.given, []);
});

test("a source that can't upload is left as it was", () => {
  const browseOnly = { name: "browse", component: () => null } as unknown as AssetSource;
  assert.equal(withLocationStripped(browseOnly), browseOnly);
});

test("the Studio config wraps every image source it is given, and shows the notes", async () => {
  const { default: config } = await import("../../sanity.config");
  const resolve = config.form?.image?.assetSources as (prev: AssetSource[], context: never) => AssetSource[];
  const [wrapped] = resolve([source], {} as never);
  assert.notEqual(wrapped.Uploader, FakeUploader, "the source's own uploader is not used bare");
  const before = FakeUploader.made.length;
  new wrapped.Uploader!();
  assert.equal(FakeUploader.made.length, before + 1, "but it does the uploading once the file is clean");
  const { LocationNoticesLayout } = await import("./LocationNotices");
  assert.equal(config.studio?.components?.layout, LocationNoticesLayout);
});

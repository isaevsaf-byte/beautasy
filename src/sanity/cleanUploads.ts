import type { AssetSource, AssetSourceUploadEvent, AssetSourceUploadFile, AssetSourceUploader } from "sanity";
import { carriesLocation } from "@/lib/photoLocation";
import { jpegWithoutLocation } from "@/lib/stripLocation";

/**
 * Every photo uploaded in the Studio loses where it was taken before it
 * leaves the browser.
 *
 * 🚨 Why here and not later: the dataset is public, and Sanity keeps the file
 * it was sent and hands it to anyone with its address. A rule that refuses to
 * publish (photoLocationRule.ts) comes too late — the original, GPS and all,
 * is out there the moment the upload ends. Kristina photographs work at home,
 * so a located photo is her home address.
 *
 * How: in Sanity 5 every way of adding a new file to an image field goes
 * through the image asset source's Uploader — the field's «Загрузить» button,
 * dropping a file on the field or on a list of photos, pasting one. The
 * Studio config (sanity.config.ts) hands each image source a wrapped Uploader
 * that reads the file first:
 *
 * - no location → the very same file goes on, untouched;
 * - a JPEG with a location → its EXIF, XMP and IPTC headers are lifted out and
 *   the Orientation note put back (@/lib/stripLocation): every pixel and the
 *   colour profile stay as they were;
 * - anything else with a location (PNG, WebP, HEIC), or a JPEG with a located
 *   picture appended after it → redrawn on a canvas, upright, and saved again;
 * - if neither leaves the file clean (HEIC in Chrome, which can't open it) →
 *   not uploaded at all, and Kristina is told what to do instead.
 *
 * Each outcome is checked with carriesLocation on the bytes that would be
 * sent, so nothing located is ever let through on trust.
 *
 * Not covered: picking an existing photo from «Загруженные изображения» (that
 * file is already in the dataset, and publishing it is still stopped by the
 * rule), and the scripts that upload straight to the API (the Gallery import
 * cleans its own files).
 */

/** What became of one file on its way up */
export type CleanedUpload =
  | { kind: "untouched"; file: File }
  | { kind: "cleaned"; file: File }
  | { kind: "refused"; file: File };

/** A message for the Studio to show; see LocationNotices.tsx */
export type LocationNotice = { kind: "cleaned" | "refused"; name: string };

const listeners = new Set<(notice: LocationNotice) => void>();

/** Hear about every photo cleaned or turned back; returns how to stop */
export function onLocationNotice(listener: (notice: LocationNotice) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function announce(notice: LocationNotice) {
  for (const listener of listeners) listener(notice);
}

/**
 * iPhone Safari won't draw a canvas past about 16.7 million pixels, and a
 * 48-megapixel photo is three times that: it would come out blank. A redrawn
 * photo is made smaller to fit — the site never shows one this large anyway.
 */
const MOST_CANVAS_PIXELS = 16_000_000;

/**
 * The photo drawn again from its pixels and saved as a new file, with no
 * metadata at all. createImageBitmap turns it upright first, because the
 * Orientation note is lost with everything else. A PNG stays a PNG so a
 * transparent background stays transparent; anything else becomes a JPEG at
 * 0.92, near enough to the original that nobody sees the difference.
 */
async function redrawn(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const scale = Math.min(1, Math.sqrt(MOST_CANVAS_PIXELS / (bitmap.width * bitmap.height)));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No canvas to draw on");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const type = file.type === "image/png" ? "image/png" : "image/jpeg";
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.92));
    if (!blob) throw new Error("The canvas would not save");
    const name = type === "image/jpeg" ? file.name.replace(/\.[^.]*$/, "") + ".jpg" : file.name;
    return new File([blob], name, { type, lastModified: file.lastModified });
  } finally {
    bitmap.close();
  }
}

const locatedFile = async (file: Blob) => carriesLocation(new Uint8Array(await file.arrayBuffer()));

/**
 * The file as it should go up. The whole file is read, not just its start:
 * WebP may keep its EXIF after the picture, and an iPhone JPEG appends a
 * second picture with headers of its own.
 */
export async function cleanForUpload(file: File, redraw: (file: File) => Promise<File> = redrawn): Promise<CleanedUpload> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!carriesLocation(bytes)) return { kind: "untouched", file };
  const stripped = jpegWithoutLocation(bytes);
  if (stripped && !carriesLocation(stripped)) {
    return { kind: "cleaned", file: new File([stripped], file.name, { type: file.type || "image/jpeg", lastModified: file.lastModified }) };
  }
  try {
    const drawn = await redraw(file);
    if (!(await locatedFile(drawn))) return { kind: "cleaned", file: drawn };
  } catch {
    // The browser can't open this format; turned back below
  }
  return { kind: "refused", file };
}

/** A refused file, in the shape the Studio's upload progress understands */
function failed(file: File): AssetSourceUploadFile {
  return {
    id: crypto.randomUUID(),
    file,
    progress: 0,
    status: "error",
    error: new Error("The photo carries a location that could not be removed, so it was not uploaded"),
  };
}

/**
 * The asset source with its Uploader wrapped, so every file it is given is
 * cleaned first; a source that can't upload is returned as it is. `clean` is
 * swappable for tests, which have no canvas.
 */
export function withLocationStripped(source: AssetSource, clean: (file: File) => Promise<CleanedUpload> = cleanForUpload): AssetSource {
  if (!source.Uploader) return source;
  const Inner = source.Uploader;

  class LocationStrippingUploader implements AssetSourceUploader {
    private inner: AssetSourceUploader;
    private subscribers = new Set<(event: AssetSourceUploadEvent) => void>();
    private stopped = false;

    constructor(...args: unknown[]) {
      this.inner = new Inner(...args);
      this.inner.subscribe((event) => this.emit(event));
    }

    private emit(event: AssetSourceUploadEvent) {
      for (const subscriber of this.subscribers) subscriber(event);
    }

    /**
     * Returns at once, as the Studio expects, and hands the files on once
     * they're clean. The Studio has already put up its progress bar by then,
     * and a refused file clears it with an error, like a failed upload.
     */
    upload(files: File[], options?: Parameters<AssetSourceUploader["upload"]>[1]): AssetSourceUploadFile[] {
      this.stopped = false;
      void Promise.all(files.map((file) => clean(file).catch((): CleanedUpload => ({ kind: "refused", file })))).then((results) => {
        // Cancelled, or the field went away, while the files were read
        if (this.stopped) return;
        for (const result of results) {
          if (result.kind !== "untouched") announce({ kind: result.kind, name: result.file.name });
        }
        const ready = results.filter((result) => result.kind !== "refused").map((result) => result.file);
        const refused = results.filter((result) => result.kind === "refused").map((result) => failed(result.file));
        if (refused.length > 0) {
          this.emit({ type: "error", files: refused });
          if (ready.length === 0) this.emit({ type: "all-complete", files: refused });
        }
        if (ready.length === 0) return;
        try {
          this.inner.upload(ready, options);
        } catch (error) {
          // Thrown after the Studio's own try/catch has moved on, so said here
          console.error(error);
          const lost = ready.map(failed);
          this.emit({ type: "error", files: lost });
          this.emit({ type: "all-complete", files: lost });
        }
      });
      return this.inner.getFiles();
    }

    abort(file?: AssetSourceUploadFile) {
      if (!file) this.stopped = true;
      this.inner.abort(file);
    }

    getFiles() {
      return this.inner.getFiles();
    }

    subscribe(subscriber: (event: AssetSourceUploadEvent) => void) {
      this.subscribers.add(subscriber);
      return () => {
        this.subscribers.delete(subscriber);
      };
    }

    updateFile(fileId: string, data: { progress?: number; status?: string; error?: Error }) {
      this.inner.updateFile(fileId, data);
    }

    reset() {
      this.inner.reset();
    }
  }

  return { ...source, Uploader: LocationStrippingUploader };
}

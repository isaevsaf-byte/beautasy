/**
 * The parts of the nightly backup that can be checked without Cloudflare:
 * what a night's copy is called, which copies are old enough to go, whether
 * an export arrived whole, and how an export of unknown length gets into R2
 * without being held in memory all at once.
 *
 * Nothing in here logs, and nothing in here keeps a document's text beyond
 * the one line it needs to look at — the backups hold customers' names.
 */

/** Every copy lives under this folder in the bucket; nothing outside it is ever touched. */
export const BACKUP_FOLDER = "sanity/";

/**
 * How many days of copies to keep. A month is long enough to notice that
 * something went missing on a quiet week, and at today's size (about half a
 * megabyte a night) thirty copies cost nothing.
 */
export const KEEP_DAYS = 30;

/**
 * R2's smallest allowed part in a multipart upload. Every part except the
 * last must be exactly the same size, so the export is cut into parts of
 * exactly this many bytes.
 */
export const PART_BYTES = 5 * 1024 * 1024;

const DAY_MS = 24 * 60 * 60 * 1000;
const NEWLINE = 0x0a;
const SUFFIX = ".ndjson";

/** "2026-10-03" for any moment of 3 October, on the clock Cloudflare's crons run on (UTC). */
export function utcDay(moment: Date): string {
  return moment.toISOString().slice(0, 10);
}

/** sanity/production-2026-10-03.ndjson: one file per night, named by the day it was taken. */
export function backupKey(dataset: string, moment: Date): string {
  return `${BACKUP_FOLDER}${dataset}-${utcDay(moment)}${SUFFIX}`;
}

/** The day in a copy's name, or null when the name is not one this Worker would have written. */
export function backupDay(key: string, dataset: string): Date | null {
  const prefix = `${BACKUP_FOLDER}${dataset}-`;
  if (!key.startsWith(prefix) || !key.endsWith(SUFFIX)) return null;
  const day = key.slice(prefix.length, -SUFFIX.length);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const date = new Date(`${day}T00:00:00Z`);
  // A name that does not come back the same (2026-02-31) is not one of ours.
  return !Number.isNaN(date.getTime()) && utcDay(date) === day ? date : null;
}

/**
 * The copies past keeping: dated more than `keepDays` days before `now`.
 *
 * The age comes from the name, not from when R2 says the file was written,
 * so a copy put back by hand keeps its real date. Files with any other name
 * are left alone — whatever someone put in the bucket themselves is theirs.
 */
export function expiredBackups(keys: string[], dataset: string, now: Date, keepDays = KEEP_DAYS): string[] {
  const today = Date.parse(`${utcDay(now)}T00:00:00Z`);
  return keys.filter((key) => {
    const day = backupDay(key, dataset);
    return day !== null && (today - day.getTime()) / DAY_MS > keepDays;
  });
}

/** What a finished export held, for the log: counts only, never contents. */
export interface ExportSummary {
  documents: number;
  bytes: number;
}

function join(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

function isDocument(line: string): boolean {
  try {
    const parsed: unknown = JSON.parse(line);
    return typeof parsed === "object" && parsed !== null && typeof (parsed as { _id?: unknown })._id === "string";
  } catch {
    return false;
  }
}

/**
 * Watches the export go past one chunk at a time, and says at the end whether
 * it arrived whole.
 *
 * Sanity answers 200 before it starts streaming, so a failure half way
 * through cannot change the status any more. What happens instead is that
 * the stream stops in the middle of a document, or ends with an
 * {"error": …} object where the next document should be — Sanity's own
 * exporter has a special case for exactly that. Either way the last line is
 * not a document, and that is what `finish` checks.
 *
 * Only the latest complete line is ever kept, never the rest of the file.
 */
export function exportTally(): { see(chunk: Uint8Array): void; finish(): ExportSummary } {
  let bytes = 0;
  let documents = 0;
  let pending: Uint8Array[] = []; // the line still arriving
  let pendingBytes = 0;
  let last: Uint8Array | null = null; // the latest complete, non-empty line

  return {
    see(chunk) {
      bytes += chunk.length;
      let start = 0;
      let lastFrom = -1;
      let lastTo = -1;
      let lastTakesPending = false;
      for (let nl = chunk.indexOf(NEWLINE); nl !== -1; nl = chunk.indexOf(NEWLINE, start)) {
        // The first newline in a chunk also closes whatever was left over from the one before.
        const takesPending = start === 0 && pendingBytes > 0;
        if (nl > start || takesPending) {
          documents += 1;
          lastFrom = start;
          lastTo = nl;
          lastTakesPending = takesPending;
        }
        start = nl + 1;
      }
      if (lastTo !== -1) {
        last = lastTakesPending ? join([...pending, chunk.subarray(lastFrom, lastTo)]) : chunk.slice(lastFrom, lastTo);
      }
      if (start > 0) {
        pending = [];
        pendingBytes = 0;
      }
      if (start < chunk.length) {
        pending.push(chunk.slice(start));
        pendingBytes += chunk.length - start;
      }
    },

    finish() {
      const decoder = new TextDecoder();
      let count = documents;
      let final = last ? decoder.decode(last) : null;
      // Sanity ends every line with a newline, but a last document without one
      // is still a whole document; the check below is what decides.
      const tail = pendingBytes > 0 ? decoder.decode(join(pending)) : "";
      if (tail.trim() !== "") {
        count += 1;
        final = tail;
      }
      if (final === null) {
        throw new Error("The export came back empty: not a single document, so nothing was saved");
      }
      if (!isDocument(final)) {
        // Said in our words only — the line itself may be half a customer's booking.
        const how = final.includes('{"error":') ? "ended with an error from Sanity" : "stopped in the middle of a document";
        throw new Error(`The export ${how}, so this copy is incomplete and was not saved`);
      }
      return { documents: count, bytes };
    },
  };
}

/** The few R2 calls this Worker makes, written out so tests can stand in for the bucket. */
export interface UploadedPart {
  partNumber: number;
  etag: string;
}
export interface MultipartUpload {
  uploadPart(partNumber: number, value: Uint8Array): Promise<UploadedPart>;
  complete(parts: UploadedPart[]): Promise<unknown>;
  abort(): Promise<void>;
}
interface PutOptions {
  httpMetadata: { contentType: string };
}
export interface BackupBucket {
  put(key: string, value: Uint8Array, options?: PutOptions): Promise<unknown>;
  createMultipartUpload(key: string, options?: PutOptions): Promise<MultipartUpload>;
  list(options: { prefix: string; cursor?: string }): Promise<{ objects: { key: string }[]; truncated: boolean; cursor?: string }>;
  delete(keys: string[]): Promise<void>;
}

/**
 * Streams the export into R2 without holding all of it in memory.
 *
 * R2 refuses a stream unless it is told the length up front, and Sanity
 * sends the export without one (it does not know the size until it has
 * finished). So the stream is cut into equal parts and sent as a multipart
 * upload, holding one part at a time. An export smaller than one part — every
 * export so far — goes up in a single put.
 *
 * `watch.finish` runs after the last byte and before anything becomes
 * visible. If it throws, a multipart upload is abandoned and a small export
 * is never put, so a broken night never sits in the bucket looking like a
 * good one.
 */
export async function streamToBucket<T>(
  bucket: BackupBucket,
  key: string,
  body: ReadableStream<Uint8Array>,
  watch: { see(chunk: Uint8Array): void; finish(): T },
  partBytes = PART_BYTES,
): Promise<T> {
  const options: PutOptions = { httpMetadata: { contentType: "application/x-ndjson" } };
  const reader = body.getReader();
  let part = new Uint8Array(partBytes);
  let filled = 0;
  let upload: MultipartUpload | null = null;
  const parts: UploadedPart[] = [];

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      watch.see(value);
      let offset = 0;
      while (offset < value.length) {
        const take = Math.min(partBytes - filled, value.length - offset);
        part.set(value.subarray(offset, offset + take), filled);
        filled += take;
        offset += take;
        if (filled === partBytes) {
          if (!upload) upload = await bucket.createMultipartUpload(key, options);
          parts.push(await upload.uploadPart(parts.length + 1, part));
          part = new Uint8Array(partBytes);
          filled = 0;
        }
      }
    }

    const result = watch.finish();
    if (!upload) {
      await bucket.put(key, part.slice(0, filled), options);
    } else {
      if (filled > 0) parts.push(await upload.uploadPart(parts.length + 1, part.slice(0, filled)));
      await upload.complete(parts);
    }
    return result;
  } catch (error) {
    // Nothing half-made is left behind: the uploaded parts go, and the download stops.
    if (upload) await upload.abort().catch(() => undefined);
    await reader.cancel().catch(() => undefined);
    throw error;
  }
}

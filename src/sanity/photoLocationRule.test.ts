import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { ConcreteRuleClass } from "sanity";
import { siteSettings } from "@/sanity/schemaTypes/siteSettings";
import { workPiece } from "@/sanity/schemaTypes/workPiece";

/**
 * Every photo Kristina uploads in the Studio is public the moment it lands,
 * original file and all, so one that still says where it was taken — her home
 * workroom — must never be published. The reading of the file is tested in
 * @/lib/photoLocation; this is the Studio refusing to publish on it, through
 * Sanity's own rule engine.
 */

type FieldDef = { name: string; type?: string; validation?: (rule: never) => unknown; fields?: FieldDef[] };

function field(parent: { fields?: unknown }, name: string): FieldDef {
  const found = ((parent.fields ?? []) as FieldDef[]).find((f) => f.name === name);
  assert.ok(found, `no field "${name}"`);
  return found;
}

/** A phone photo as it comes off the phone: with where it was taken, or without */
async function photo({ located }: { located: boolean }): Promise<Uint8Array> {
  const canvas = sharp({ create: { width: 48, height: 36, channels: 3, background: "#dcd0ff" } });
  const where = { IFD3: { GPSLatitudeRef: "N", GPSLatitude: "50/1 54/1 3/1", GPSLongitudeRef: "W", GPSLongitude: "1/1 24/1 5/1" } };
  return new Uint8Array(await (located ? canvas.withExif(where) : canvas).jpeg().toBuffer());
}

/**
 * The Studio as the rule sees it: each uploaded asset's file at its own
 * address. Every test uses its own asset ids, because an answer is kept per
 * file for as long as the Studio is open.
 */
async function uploaded(t: TestContext, files: Record<string, { located: boolean }>) {
  const bytes = new Map<string, Uint8Array>();
  for (const [ref, kind] of Object.entries(files)) bytes.set(`https://cdn.sanity.io/files/${ref}`, await photo(kind));
  t.mock.method(globalThis, "fetch", async (url: string) => {
    const body = bytes.get(String(url));
    return body ? new Response(body.slice()) : new Response(null, { status: 404 });
  });
  return {
    i18n: { t: (key: string) => key },
    path: [],
    getClient: () => ({ fetch: async (_query: string, { ref }: { ref: string }) => `https://cdn.sanity.io/files/${ref}` }),
  } as never;
}

/** What the Studio would say about a value, through Sanity's own rule engine */
async function says(rule: unknown, value: unknown, context: never): Promise<string[]> {
  const rules = (Array.isArray(rule) ? rule : [rule]) as {
    validate: (value: unknown, context: never) => Promise<{ level: string; message: string }[]>;
  }[];
  const markers = (await Promise.all(rules.map((r) => r.validate(value, context)))).flat();
  return markers.map((marker) => `${marker.level}: ${marker.message}`);
}

const image = (ref: string) => ({ _type: "image", asset: { _type: "reference", _ref: ref } });

test("Meet Kristina's portrait and photo at work are not published while they say where they were taken", async (t) => {
  const context = await uploaded(t, {
    "image-portraitgps-3024x4032-jpg": { located: true },
    "image-portraitclean-3024x4032-jpg": { located: false },
    "image-atworkgps-4032x3024-jpg": { located: true },
    "image-atworkclean-4032x3024-jpg": { located: false },
  });
  const group = field(siteSettings, "meetKristina");
  for (const [name, withPlace, without] of [
    ["photo", "image-portraitgps-3024x4032-jpg", "image-portraitclean-3024x4032-jpg"],
    ["atWork", "image-atworkgps-4032x3024-jpg", "image-atworkclean-4032x3024-jpg"],
  ] as const) {
    const rule = field(group, name).validation!(ConcreteRuleClass.object() as never);
    const located = await says(rule, image(withPlace), context);
    assert.equal(located.length, 1, `${name}: one thing to say`);
    assert.match(located[0], /^error: /, `${name}: an error, which stops publishing — not a warning`);
    assert.match(located[0], /GPS/, name);
    assert.match(located[0], /Геопозиция/, `${name}: and how to send it without`);
    assert.match(located[0], /Сафар.*удалил/, `${name}: the uploaded file is already public, so Safar deletes it`);
    assert.deepEqual(await says(rule, image(without), context), [], `${name}: a photo without a place passes`);
  }
});

test("a file the Studio can't read is let through, so a bad connection never stops Kristina publishing", async (t) => {
  const context = await uploaded(t, {});
  const rule = field(field(siteSettings, "meetKristina"), "photo").validation!(ConcreteRuleClass.object() as never);
  assert.deepEqual(await says(rule, image("image-unreadable-3024x4032-jpg"), context), []);
});

test("the gallery still turns them back too, with its own way out", async (t) => {
  const context = await uploaded(t, { "image-gallerygps-3024x4032-jpg": { located: true } });
  const rule = field(workPiece, "before").validation!(ConcreteRuleClass.object() as never);
  const located = await says(rule, image("image-gallerygps-3024x4032-jpg"), context);
  assert.equal(located.length, 1);
  assert.match(located[0], /^error: .*GPS.*Gallery/);
});

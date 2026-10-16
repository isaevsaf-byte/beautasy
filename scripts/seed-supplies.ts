/**
 * Puts the starting «Где брать мини-опт» list into the Studio (16.10.2026),
 * from SUPPLY_SEED in src/lib/supplies.ts — each item only if it is not
 * there yet, so an item Kristina has edited stays as she left it.
 *
 * Once the list is in the Studio it is hers: an item she deleted would come
 * back with a plain --write, so after the first time --write needs --only and
 * the ids to add.
 *
 *   node --env-file=.env.local --import tsx scripts/seed-supplies.ts                                   # what it would add
 *   node --env-file=.env.local --import tsx scripts/seed-supplies.ts --write                           # the first time
 *   node --env-file=.env.local --import tsx scripts/seed-supplies.ts --write --only supply-bump,supply-elastic-19
 */
import { sanityWriteClient } from "../src/lib/sanity";
import { SUPPLY_SEED } from "../src/lib/supplies";

async function main() {
  const write = process.argv.includes("--write");
  const onlyAt = process.argv.indexOf("--only");
  const only = onlyAt >= 0 ? new Set((process.argv[onlyAt + 1] ?? "").split(",").filter(Boolean)) : null;
  const unknown = only ? [...only].filter((id) => !SUPPLY_SEED.some((item) => item._id === id)) : [];
  if (unknown.length) throw new Error(`Нет в списке: ${unknown.join(", ")}`);

  const ids = SUPPLY_SEED.map((item) => item._id);
  const there = new Set(await sanityWriteClient.fetch<string[]>(`*[_id in $ids || _id in $drafts]._id`, { ids, drafts: ids.map((id) => `drafts.${id}`) }));
  const any = await sanityWriteClient.fetch<number>(`count(*[_type == "supplyItem"])`);
  const fresh = SUPPLY_SEED.filter((item) => !there.has(item._id) && !there.has(`drafts.${item._id}`) && (!only || only.has(item._id)));
  for (const item of SUPPLY_SEED) console.log(`${there.has(item._id) ? "есть    " : fresh.includes(item) ? "добавить" : "нет     "}  ${item._id}  ${item.name}`);
  if (fresh.length === 0) {
    console.log("\nДобавлять нечего — всё уже в Studio.");
    return;
  }
  if (!write) {
    console.log(`\nДобавлю ${fresh.length}. Запустите с --write${any && !only ? " --only <id,id>" : ""}.`);
    return;
  }
  // A list already in the Studio is Kristina's: what is missing from it she may have deleted
  if (any && !only) {
    console.log(`\nВ Studio уже ${any} — список её. Чтобы добавить, назовите что: --write --only ${fresh.map((item) => item._id).join(",")}`);
    process.exitCode = 1;
    return;
  }
  const tx = sanityWriteClient.transaction();
  for (const item of fresh) {
    tx.createIfNotExists({
      ...item,
      _type: "supplyItem",
      offers: item.offers.map((offer) => ({ ...offer, _type: "supplyOffer" })),
    });
  }
  await tx.commit();
  console.log(`Добавлено: ${fresh.length}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluate, parse } from "groq-js";
import {
  canMove,
  claimSlot,
  moveBooking,
  movedCopy,
  type DiaryDoc,
  type DiaryStore,
  type DiaryWrite,
} from "./diary";
import { TAKEN_QUERY } from "./schedule";
import { PENDING_QUERY } from "./bookingEmails";

/**
 * The diary is exercised against a store that behaves the way Sanity was
 * measured to behave (dry run against the live API, 26 September 2026):
 * creating over an id that exists is refused with 409, so is a patch guarded
 * by a revision that has moved on, deleting something that is not there is
 * fine, and a transaction happens whole or not at all. Every write moves the
 * revision on. Each call yields before it acts, so two callers interleave the
 * way two requests on two Vercel functions do.
 */
class MemoryStore implements DiaryStore {
  docs = new Map<string, DiaryDoc>();
  private revs = 0;
  private writes = 0;
  /** Set to make the next calls fail as a database outage would */
  down = false;
  /** Runs before each write, with its number from 1 — throwing turns the write away untouched */
  beforeWrite?: (n: number) => void;
  /** Runs after each write has landed — throwing loses its answer, as a dropped connection does */
  afterWrite?: (n: number) => void;

  private nextRev() {
    this.revs += 1;
    return `rev${this.revs}`;
  }

  private static conflict(message: string) {
    return Object.assign(new Error(message), { statusCode: 409 });
  }

  private outage() {
    if (this.down) throw Object.assign(new Error("Service unavailable"), { statusCode: 503 });
  }

  seed(doc: DiaryDoc) {
    this.docs.set(doc._id, { ...doc, _rev: this.nextRev() });
  }

  async create(doc: DiaryDoc) {
    await Promise.resolve();
    this.outage();
    const n = ++this.writes;
    this.beforeWrite?.(n);
    if (this.docs.has(doc._id)) throw MemoryStore.conflict(`Document by ID "${doc._id}" already exists`);
    this.docs.set(doc._id, { ...doc, _rev: this.nextRev() });
    this.afterWrite?.(n);
  }

  async read(id: string) {
    await Promise.resolve();
    this.outage();
    const doc = this.docs.get(id);
    return doc ? { ...doc } : null;
  }

  async remove(id: string) {
    await Promise.resolve();
    this.outage();
    const n = ++this.writes;
    this.beforeWrite?.(n);
    this.docs.delete(id);
    this.afterWrite?.(n);
  }

  async commit(writes: DiaryWrite[]) {
    await Promise.resolve();
    this.outage();
    const n = ++this.writes;
    this.beforeWrite?.(n);
    const next = new Map(this.docs);
    for (const write of writes) {
      if ("create" in write) {
        if (next.has(write.create._id)) throw MemoryStore.conflict(`"${write.create._id}" already exists`);
        next.set(write.create._id, { ...write.create, _rev: this.nextRev() });
      } else if ("replace" in write) {
        next.set(write.replace._id, { ...write.replace, _rev: this.nextRev() });
      } else if ("guard" in write) {
        const current = next.get(write.guard.id);
        if (!current || current._rev !== write.guard.rev) {
          throw MemoryStore.conflict(`"${write.guard.id}" has unexpected revision`);
        }
        next.set(write.guard.id, { ...current, ...write.guard.mark, _rev: this.nextRev() });
      } else {
        next.delete(write.remove);
      }
    }
    this.docs = next;
    this.afterWrite?.(n);
  }
}

/** What a dropped connection throws: no status, so nothing is known */
const lostAnswer = () => Object.assign(new Error("socket hang up"), { code: "ECONNRESET" });
/** What an expired token earns: turned away before anything was done */
const turnedAway = () => Object.assign(new Error("Unauthorized"), { statusCode: 401 });

const NOW = "2026-09-27T10:00:00.000Z";

function booking(slot: string, fields: Partial<DiaryDoc> = {}): DiaryDoc {
  return {
    _id: `slot-${slot.replace("T", "-").replace(":", "")}`,
    _type: "atelierBooking",
    slotStart: slot,
    status: "confirmed",
    displayName: "Anna",
    service: "Alterations",
    ...fields,
  };
}

test("a free time is taken", async () => {
  const store = new MemoryStore();
  assert.equal(await claimSlot(store, booking("2026-10-06T14:00"), NOW), "claimed");
  assert.equal(store.docs.get("slot-2026-10-06-1400")?.displayName, "Anna");
});

test("a time somebody holds is refused, and they keep it", async () => {
  for (const status of ["new", "confirmed", "completed"]) {
    const store = new MemoryStore();
    store.seed(booking("2026-10-06T14:00", { status, displayName: "Maria" }));
    assert.equal(await claimSlot(store, booking("2026-10-06T14:00"), NOW), "taken", status);
    assert.equal(store.docs.get("slot-2026-10-06-1400")?.displayName, "Maria", status);
  }
});

test("a time given back can be booked again, and the old booking is kept as a record", async () => {
  for (const status of ["declined", "cancelled"]) {
    const store = new MemoryStore();
    store.seed(booking("2026-10-06T14:00", { status, displayName: "Maria", replyNote: "Sorry!" }));
    const oldRev = store.docs.get("slot-2026-10-06-1400")?._rev;
    store.seed({ _id: "drafts.slot-2026-10-06-1400", _type: "atelierBooking", status: "confirmed" });

    assert.equal(await claimSlot(store, booking("2026-10-06T14:00"), NOW), "claimed", status);

    const now = store.docs.get("slot-2026-10-06-1400");
    assert.equal(now?.displayName, "Anna", status);
    assert.equal(now?.status, "confirmed", status);

    const record = store.docs.get(`slot-2026-10-06-1400-released-${oldRev}`);
    assert.equal(record?.displayName, "Maria", status);
    assert.equal(record?.status, status);
    assert.equal(record?.replyNote, "Sorry!");
    assert.equal(record?.releasedAt, NOW);
    assert.equal(store.docs.has("drafts.slot-2026-10-06-1400"), false, "an open draft of the old booking would publish over the new one");
  }
});

test("two people reaching for the same freed time end with one booking", async () => {
  const store = new MemoryStore();
  store.seed(booking("2026-10-06T14:00", { status: "declined", displayName: "Maria" }));

  const results = await Promise.all([
    claimSlot(store, booking("2026-10-06T14:00", { displayName: "Anna" }), NOW),
    claimSlot(store, booking("2026-10-06T14:00", { displayName: "Olga" }), NOW),
  ]);

  assert.deepEqual([...results].sort(), ["claimed", "taken"]);
  const holder = store.docs.get("slot-2026-10-06-1400")?.displayName;
  assert.equal(holder, results[0] === "claimed" ? "Anna" : "Olga");
  assert.equal([...store.docs.keys()].filter((id) => id.includes("-released-")).length, 1);
});

test("two people reaching for the same free time end with one booking", async () => {
  const store = new MemoryStore();
  const results = await Promise.all([
    claimSlot(store, booking("2026-10-06T14:00", { displayName: "Anna" }), NOW),
    claimSlot(store, booking("2026-10-06T14:00", { displayName: "Olga" }), NOW),
  ]);
  assert.deepEqual([...results].sort(), ["claimed", "taken"]);
});

test("a booking brought back while its time was being taken keeps the time", async () => {
  const store = new MemoryStore();
  store.seed(booking("2026-10-06T14:00", { status: "declined", displayName: "Maria" }));
  // Kristina changes her mind and confirms Maria again, just after the read
  const read = store.read.bind(store);
  store.read = async (id) => {
    const seen = await read(id);
    store.seed({ ...store.docs.get(id)!, status: "confirmed" });
    return seen;
  };

  assert.equal(await claimSlot(store, booking("2026-10-06T14:00"), NOW), "taken");
  assert.equal(store.docs.get("slot-2026-10-06-1400")?.displayName, "Maria");
  assert.equal(store.docs.get("slot-2026-10-06-1400")?.status, "confirmed");
});

test("a database that does not answer at all is 'unsure', never 'taken'", async () => {
  const store = new MemoryStore();
  store.down = true;
  assert.equal(await claimSlot(store, booking("2026-10-06T14:00"), NOW), "unsure");
});

test("a write turned away is a plain failure, and nothing is looked up", async () => {
  const store = new MemoryStore();
  store.beforeWrite = () => {
    throw turnedAway();
  };
  let reads = 0;
  const read = store.read.bind(store);
  store.read = async (id) => {
    reads++;
    return read(id);
  };
  assert.equal(await claimSlot(store, booking("2026-10-06T14:00"), NOW), "failed");
  assert.equal(reads, 0);
});

test("a booking whose answer was lost after it landed is known to hold its time", async () => {
  const store = new MemoryStore();
  store.afterWrite = (n) => {
    if (n === 1) throw lostAnswer();
  };
  assert.equal(await claimSlot(store, booking("2026-10-06T14:00"), NOW), "claimed");
  assert.equal(store.docs.get("slot-2026-10-06-1400")?.displayName, "Anna");
});

test("a booking whose answer was lost before it landed is a failure", async () => {
  const store = new MemoryStore();
  store.beforeWrite = (n) => {
    if (n === 1) throw lostAnswer();
  };
  assert.equal(await claimSlot(store, booking("2026-10-06T14:00"), NOW), "failed");
  assert.equal(store.docs.size, 0);
});

test("a lost answer while someone else holds the time is 'taken', not ours", async () => {
  const store = new MemoryStore();
  store.seed(booking("2026-10-06T14:00", { displayName: "Maria" }));
  store.beforeWrite = (n) => {
    if (n === 1) throw lostAnswer();
  };
  assert.equal(await claimSlot(store, booking("2026-10-06T14:00"), NOW), "taken");
  assert.equal(store.docs.get("slot-2026-10-06-1400")?.displayName, "Maria");
});

test("taking over a freed time that landed but lost its answer holds it", async () => {
  const store = new MemoryStore();
  store.seed(booking("2026-10-06T14:00", { status: "cancelled", displayName: "Maria" }));
  // Write 1 is the refused create; write 2 is the take-over
  store.afterWrite = (n) => {
    if (n === 2) throw lostAnswer();
  };
  assert.equal(await claimSlot(store, booking("2026-10-06T14:00"), NOW), "claimed");
  assert.equal(store.docs.get("slot-2026-10-06-1400")?.displayName, "Anna");
});

test("a freed booking whose email went out while it was being taken is looked at again, and taken", async () => {
  const store = new MemoryStore();
  store.seed(booking("2026-10-06T14:00", { status: "declined", displayName: "Maria" }));
  // The "sorry" to Maria is claimed just after her booking was read: new revision, same freed time
  const read = store.read.bind(store);
  let once = true;
  store.read = async (id) => {
    const seen = await read(id);
    if (once && seen) {
      once = false;
      store.seed({ ...store.docs.get(id)!, notifiedStatus: "declined" });
    }
    return seen;
  };
  assert.equal(await claimSlot(store, booking("2026-10-06T14:00"), NOW), "claimed");
  assert.equal(store.docs.get("slot-2026-10-06-1400")?.displayName, "Anna");
  const records = [...store.docs.values()].filter((doc) => doc._id.includes("-released-"));
  assert.equal(records.length, 1);
  assert.equal(records[0].notifiedStatus, "declined", "the record keeps the claim its email carries");
});

test("a holder that vanished between the refusal and the read frees the time", async () => {
  const store = new MemoryStore();
  store.seed(booking("2026-10-06T14:00", { status: "confirmed" }));
  const read = store.read.bind(store);
  store.read = async (id) => {
    store.docs.delete(id);
    return read(id);
  };
  assert.equal(await claimSlot(store, booking("2026-10-06T14:00"), NOW), "claimed");
});

/* ─── Moving ─── */

const SEALED = { nameSealed: "v1.x", emailSealed: "v1.y", phoneSealed: "v1.z", emailFingerprint: "fp" };

test("a booking moves to a free time with everything it had, and the old time is freed", async () => {
  const store = new MemoryStore();
  store.seed(
    booking("2026-10-06T14:00", {
      ...SEALED,
      confirmedFor: "Tuesday 6 October at 2:00pm",
      notifiedStatus: "confirmed",
      replyNote: "Bring the belt too",
      referralDiscount: 500,
      createdAt: "2026-09-20T09:00:00.000Z",
    })
  );
  const from = (await store.read("slot-2026-10-06-1400"))!;

  const to = movedCopy(from, "2026-10-08T11:30", NOW);
  assert.equal(await moveBooking(store, { from, to, now: NOW }), "moved");

  assert.equal(store.docs.has("slot-2026-10-06-1400"), false, "the old time is free");
  const moved = store.docs.get("slot-2026-10-08-1130")!;
  assert.equal(moved.slotStart, "2026-10-08T11:30");
  assert.equal(moved.confirmedFor, "Thursday 8 October at 11:30am");
  assert.equal(moved.movedFrom, "Tuesday 6 October at 2:00pm");
  assert.equal(moved.status, "confirmed");
  assert.equal(moved.kristinaNotifiedAt, NOW);
  assert.equal(moved.createdAt, "2026-09-20T09:00:00.000Z", "when they first asked is kept");
  assert.equal(moved.referralDiscount, 500);
  for (const [field, value] of Object.entries(SEALED)) assert.equal(moved[field], value, field);
  assert.equal(moved.replyNote, undefined, "a note about the old time does not travel");
});

test("a request with no time gets one, and says nothing about moving", async () => {
  const store = new MemoryStore();
  store.seed({ _id: "abc123", _type: "atelierBooking", status: "new", preferredDate: "Tuesday?", ...SEALED });
  const from = (await store.read("abc123"))!;
  const to = movedCopy(from, "2026-10-06T14:00", NOW);

  assert.equal(await moveBooking(store, { from, to, now: NOW }), "moved");
  assert.equal(store.docs.has("abc123"), false);
  const booked = store.docs.get("slot-2026-10-06-1400")!;
  assert.equal(booked.status, "confirmed");
  assert.equal(booked.movedFrom, undefined);
  assert.equal(booked.preferredDate, "Tuesday?");
});

test("a move onto a time somebody holds changes nothing", async () => {
  const store = new MemoryStore();
  store.seed(booking("2026-10-06T14:00"));
  store.seed(booking("2026-10-08T11:30", { displayName: "Maria" }));
  const from = (await store.read("slot-2026-10-06-1400"))!;

  const to = movedCopy(from, "2026-10-08T11:30", NOW);
  assert.equal(await moveBooking(store, { from, to, now: NOW }), "taken");
  assert.equal(store.docs.get("slot-2026-10-06-1400")?.displayName, "Anna");
  assert.equal(store.docs.get("slot-2026-10-08-1130")?.displayName, "Maria");
});

test("a booking edited while it was being moved keeps its time, and the new one is handed back", async () => {
  const store = new MemoryStore();
  store.seed(booking("2026-10-06T14:00"));
  const from = (await store.read("slot-2026-10-06-1400"))!;
  // Kristina saves the booking in another tab after it was read
  store.seed({ ...store.docs.get("slot-2026-10-06-1400")!, replyNote: "edited" });

  const to = movedCopy(from, "2026-10-08T11:30", NOW);
  assert.equal(await moveBooking(store, { from, to, now: NOW }), "changed");
  assert.equal(store.docs.get("slot-2026-10-06-1400")?.replyNote, "edited");
  assert.equal(store.docs.has("slot-2026-10-08-1130"), false, "no second booking left behind");
});

test("a move whose letting-go landed but lost its answer keeps the new booking", async () => {
  const store = new MemoryStore();
  store.seed(booking("2026-10-06T14:00", SEALED));
  const from = (await store.read("slot-2026-10-06-1400"))!;
  // Write 1 takes the new time; write 2 lets go of the old one, and its answer is lost
  store.afterWrite = (n) => {
    if (n === 2) throw lostAnswer();
  };

  assert.equal(await moveBooking(store, { from, to: movedCopy(from, "2026-10-08T11:30", NOW), now: NOW }), "moved");
  assert.equal(store.docs.has("slot-2026-10-06-1400"), false);
  assert.equal(store.docs.get("slot-2026-10-08-1130")?.displayName, "Anna", "the only copy of the booking stays");
});

test("a move whose letting-go never landed hands the new time back", async () => {
  const store = new MemoryStore();
  store.seed(booking("2026-10-06T14:00", { ...SEALED, createdAt: "2026-09-20T09:00:00.000Z" }));
  const from = (await store.read("slot-2026-10-06-1400"))!;
  store.beforeWrite = (n) => {
    if (n === 2) throw lostAnswer();
  };

  assert.equal(await moveBooking(store, { from, to: movedCopy(from, "2026-10-08T11:30", NOW), now: NOW }), "failed");
  assert.equal(store.docs.get("slot-2026-10-06-1400")?.displayName, "Anna");
  assert.equal(store.docs.has("slot-2026-10-08-1130"), false);
});

test("a move that landed, lost its answer, and whose freed time was booked at once keeps the new booking", async () => {
  const store = new MemoryStore();
  store.seed(booking("2026-10-06T14:00", { ...SEALED, createdAt: "2026-09-20T09:00:00.000Z" }));
  const from = (await store.read("slot-2026-10-06-1400"))!;
  store.afterWrite = (n) => {
    if (n === 2) {
      // 2pm is free the moment Anna lets go of it, and Olga books it before the look
      store.seed(booking("2026-10-06T14:00", { displayName: "Olga", nameSealed: "v1.olga", createdAt: NOW }));
      throw lostAnswer();
    }
  };

  assert.equal(await moveBooking(store, { from, to: movedCopy(from, "2026-10-08T11:30", NOW), now: NOW }), "moved");
  assert.equal(store.docs.get("slot-2026-10-08-1130")?.displayName, "Anna", "Anna keeps her new time");
  assert.equal(store.docs.get("slot-2026-10-06-1400")?.displayName, "Olga");
});

test("a lost answer on a booking with nothing to tell it by undoes nothing", async () => {
  const store = new MemoryStore();
  store.seed(booking("2026-10-06T14:00"));
  const from = (await store.read("slot-2026-10-06-1400"))!;
  store.beforeWrite = (n) => {
    if (n === 2) throw lostAnswer();
  };

  assert.equal(await moveBooking(store, { from, to: movedCopy(from, "2026-10-08T11:30", NOW), now: NOW }), "unsure");
  assert.equal(store.docs.has("slot-2026-10-06-1400"), true);
  assert.equal(store.docs.has("slot-2026-10-08-1130"), true);
});

test("a move that loses its answer and then cannot look undoes nothing", async () => {
  const store = new MemoryStore();
  store.seed(booking("2026-10-06T14:00", { ...SEALED, createdAt: "2026-09-20T09:00:00.000Z" }));
  const from = (await store.read("slot-2026-10-06-1400"))!;
  // Only the look fails: handing the new time back would still go through
  let looksFail = false;
  const read = store.read.bind(store);
  store.read = async (id) => {
    if (looksFail) throw Object.assign(new Error("Service unavailable"), { statusCode: 503 });
    return read(id);
  };
  store.afterWrite = (n) => {
    if (n === 2) {
      looksFail = true;
      throw lostAnswer();
    }
  };

  assert.equal(await moveBooking(store, { from, to: movedCopy(from, "2026-10-08T11:30", NOW), now: NOW }), "unsure");
  assert.equal(store.docs.get("slot-2026-10-08-1130")?.displayName, "Anna", "the booking is left where it landed");
});

test("a move that can neither let go nor give back says it is unsure", async () => {
  const store = new MemoryStore();
  store.seed(booking("2026-10-06T14:00"));
  const from = (await store.read("slot-2026-10-06-1400"))!;
  store.seed({ ...store.docs.get("slot-2026-10-06-1400")!, replyNote: "edited in another tab" });
  // Write 3 is handing the new time back
  store.beforeWrite = (n) => {
    if (n === 3) throw Object.assign(new Error("Service unavailable"), { statusCode: 503 });
  };

  assert.equal(await moveBooking(store, { from, to: movedCopy(from, "2026-10-08T11:30", NOW), now: NOW }), "unsure");
  assert.equal(store.docs.has("slot-2026-10-06-1400"), true);
  assert.equal(store.docs.has("slot-2026-10-08-1130"), true);
});

test("a request confirmed by typing is told the typed time is replaced", () => {
  const typed = {
    _id: "req1",
    _type: "atelierBooking",
    _rev: "r1",
    status: "confirmed",
    notifiedStatus: "confirmed",
    confirmedFor: "Tues 6th, 2pm",
  };
  assert.equal(movedCopy(typed, "2026-10-08T11:30", NOW).movedFrom, "Tues 6th, 2pm");
  // The same time, typed in the diary's own words: nothing moved
  assert.equal(
    movedCopy({ ...typed, confirmedFor: "thursday 8 october at 11:30am" }, "2026-10-08T11:30", NOW).movedFrom,
    undefined
  );
  // Typed, but never sent: the customer was not told it, so nothing to replace
  assert.equal(movedCopy({ ...typed, notifiedStatus: undefined }, "2026-10-08T11:30", NOW).movedFrom, undefined);
  assert.equal(movedCopy({ ...typed, status: "new", notifiedStatus: undefined }, "2026-10-08T11:30", NOW).movedFrom, undefined);
});

test("a note waiting on a request goes with its time; a note from an earlier reply stays behind", () => {
  const request = { _id: "req1", _type: "atelierBooking", _rev: "r1", replyNote: "Bring the belt too" };
  assert.equal(movedCopy({ ...request, status: "new" }, "2026-10-08T11:30", NOW).replyNote, "Bring the belt too");
  assert.equal(
    movedCopy({ ...request, status: "confirmed", notifiedStatus: "confirmed" }, "2026-10-08T11:30", NOW).replyNote,
    undefined
  );
  assert.equal(movedCopy({ ...request, status: "declined" }, "2026-10-08T11:30", NOW).replyNote, undefined);
});

test("a booking whose time went to someone else is booked again at a free one", async () => {
  const store = new MemoryStore();
  // Maria cancelled 2pm, and Olga took it: Maria's booking is the record the diary kept
  store.seed(booking("2026-10-06T14:00", { displayName: "Olga" }));
  store.seed({
    ...booking("2026-10-06T14:00", { status: "cancelled", notifiedStatus: "cancelled", displayName: "Maria", ...SEALED }),
    _id: "slot-2026-10-06-1400-released-rev1",
    releasedAt: "2026-10-01T09:00:00.000Z",
  });
  const from = (await store.read("slot-2026-10-06-1400-released-rev1"))!;

  const to = movedCopy(from, "2026-10-09T15:00", NOW);
  assert.equal(to.releasedAt, undefined, "the new booking is not a record");
  assert.equal(to.movedFrom, undefined, "she was told it was cancelled: nothing moved, she is booked");
  // Not yet told it was off, she still thinks she has 2pm: that is a move
  assert.equal(movedCopy({ ...from, notifiedStatus: "confirmed" }, "2026-10-09T15:00", NOW).movedFrom, "Tuesday 6 October at 2:00pm");
  assert.equal(await moveBooking(store, { from, to, now: NOW }), "moved");

  assert.equal(store.docs.has("slot-2026-10-06-1400-released-rev1"), false);
  assert.equal(store.docs.get("slot-2026-10-06-1400")?.displayName, "Olga", "Olga keeps her time");
  const again = store.docs.get("slot-2026-10-09-1500")!;
  assert.equal(again.displayName, "Maria");
  assert.equal(again.status, "confirmed");
  assert.equal(again.nameSealed, SEALED.nameSealed);
});

test("booked again at the very time it gave back, it says nothing about moving", () => {
  const record = {
    ...booking("2026-10-06T14:00", { status: "cancelled" }),
    _id: "slot-2026-10-06-1400-released-rev1",
    _rev: "r9",
    releasedAt: "2026-10-01T09:00:00.000Z",
  };
  assert.equal(movedCopy(record, "2026-10-06T14:00", NOW).movedFrom, undefined);
});

test("any booking can be given a time except a finished one", () => {
  for (const status of ["new", "confirmed", "declined", "cancelled"]) assert.equal(canMove(status), true, status);
  for (const status of ["completed", undefined, "anything"]) assert.equal(canMove(status), false, String(status));
});

/* ─── What the diary counts as taken ─── */

test("the diary counts a time as taken while a booking holds it, and not after", async () => {
  const docs = [
    booking("2026-10-06T09:00", { status: "new" }),
    booking("2026-10-06T09:30", { status: "confirmed" }),
    booking("2026-10-06T10:00", { status: "completed" }),
    booking("2026-10-06T10:30", { status: "declined" }),
    booking("2026-10-06T11:00", { status: "cancelled" }),
    // The record left behind when a freed time was booked again
    { ...booking("2026-10-06T11:30", { status: "declined" }), _id: "slot-2026-10-06-1130-released-rev7" },
    // Booked by hand in the Studio: the same id scheme, the same diary
    booking("2026-10-06T12:00", { status: "confirmed", bookedBy: "studio" }),
    // A request with no time holds nothing
    { _id: "req1", _type: "atelierBooking", status: "new", preferredDate: "Tuesday" },
  ];
  const taken = await (await evaluate(parse(TAKEN_QUERY), { dataset: docs })).get();
  assert.deepEqual([...taken].sort(), [
    "2026-10-06T09:00",
    "2026-10-06T09:30",
    "2026-10-06T10:00",
    "2026-10-06T12:00",
  ]);
});

test("a record whose time went to someone else is never emailed 'booked in', and still gets its sorry", async () => {
  const record = (fields: Partial<DiaryDoc>) => ({
    ...booking("2026-10-06T14:00", { emailSealed: "v1.y", createdAt: "2026-09-20T09:00:00.000Z", ...fields }),
    _id: `slot-2026-10-06-1400-released-${fields.status}`,
    releasedAt: "2026-10-01T09:00:00.000Z",
  });
  const docs = [
    // Confirmed again by some other way in: another customer holds 2pm now
    record({ status: "confirmed" }),
    record({ status: "completed" }),
    // Declined, and its email not yet gone when the time was taken
    record({ status: "declined", notifiedStatus: "confirmed" }),
    // An ordinary booking still owed its confirmation
    booking("2026-10-07T10:00", { emailSealed: "v1.z", createdAt: "2026-09-21T09:00:00.000Z" }),
  ];
  // groq-js slices by constants only, as the other queue tests do
  const pending = await (await evaluate(parse(PENDING_QUERY.replace("$limit", "25")), { dataset: docs })).get();
  assert.deepEqual(
    pending.map((doc: DiaryDoc) => doc._id).sort(),
    ["slot-2026-10-06-1400-released-declined", "slot-2026-10-07-1000"]
  );
});

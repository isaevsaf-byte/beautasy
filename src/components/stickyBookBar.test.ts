import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { followBookBar, type BookBarWindow } from "./StickyBookBar";

/**
 * The phone's booking bar as the browser drives it: the page drawn, then
 * scrolled and turned, with the first "Choose a time" and the form moved to
 * where they would be on the screen each time. Where the bar sits on each
 * page is tested with the pages, in src/app/landingPages.test.ts.
 */

type Edges = { top: number; bottom: number };

/** A phone 800px tall, the hero's button still on screen and the form far below */
function phone() {
  const listeners: { type: string; listener: () => void; passive?: boolean }[] = [];
  const frames: (() => void)[] = [];
  const where: Record<string, Edges> = { hero: { top: 200, bottom: 250 }, book: { top: 5000, bottom: 6000 } };
  const win: BookBarWindow = {
    innerHeight: 800,
    document: {
      getElementById: (id) => (where[id] ? { getBoundingClientRect: () => where[id] } : null),
    },
    addEventListener: (type, listener, options) => void listeners.push({ type, listener, passive: options?.passive }),
    removeEventListener: (type, listener) => {
      const at = listeners.findIndex((l) => l.type === type && l.listener === listener);
      if (at !== -1) listeners.splice(at, 1);
    },
    requestAnimationFrame: (callback) => frames.push(callback),
    cancelAnimationFrame: (handle) => void (frames[handle - 1] = () => {}),
  };
  const fire = (type: string) => listeners.filter((l) => l.type === type).forEach((l) => l.listener());
  return {
    win,
    listeners,
    /** The first frame after the page is drawn */
    paint: () => frames.splice(0).forEach((frame) => frame()),
    scrollTo: (hero: Edges, book: Edges) => {
      where.hero = hero;
      where.book = book;
      fire("scroll");
    },
    turn: (height: number) => {
      win.innerHeight = height;
      fire("resize");
    },
  };
}

test("the bar comes up once the hero's button has scrolled away, and goes as soon as the form's top is on screen", () => {
  const screen = phone();
  const said: boolean[] = [];
  const stop = followBookBar(screen.win, "hero", "book", (shown) => said.push(shown));
  const now = () => said.at(-1);

  screen.paint();
  assert.equal(now(), false, "hidden while the hero's button is on screen");

  screen.scrollTo({ top: -300, bottom: -250 }, { top: 3000, bottom: 4000 });
  assert.equal(now(), true, "up once the button has scrolled off the top");

  // The form's top is on screen, its bottom still below: the bar would sit
  // over the form's first fields and its button
  screen.scrollTo({ top: -2800, bottom: -2750 }, { top: 500, bottom: 1500 });
  assert.equal(now(), false, "never over the form");

  screen.scrollTo({ top: -4200, bottom: -4150 }, { top: -900, bottom: -100 });
  assert.equal(now(), false, "not over the footer after it");

  // A jump from the footer back up the page crosses nothing on the way
  screen.scrollTo({ top: -300, bottom: -250 }, { top: 3000, bottom: 4000 });
  assert.equal(now(), true, "back again after jumping up");

  stop();
  assert.equal(screen.listeners.length, 0, "stops listening when the page goes");
});

test("turning the phone counts too: the form's top coming onto a taller screen sends the bar away", () => {
  const screen = phone();
  const said: boolean[] = [];
  followBookBar(screen.win, "hero", "book", (shown) => said.push(shown));
  screen.scrollTo({ top: -300, bottom: -250 }, { top: 900, bottom: 1900 });
  assert.equal(said.at(-1), true, "the form starts just below an 800px screen");
  screen.turn(1000);
  assert.equal(said.at(-1), false, "on a 1000px one it is in sight");
});

test("scrolling is listened to without holding the page back", () => {
  const screen = phone();
  followBookBar(screen.win, "hero", "book", () => {});
  assert.deepEqual(
    screen.listeners.map((l) => [l.type, l.passive ?? false]),
    [["scroll", true], ["resize", false]]
  );
});

test("a page without the button or the form keeps the bar hidden, and nothing breaks", () => {
  const screen = phone();
  const said: boolean[] = [];
  followBookBar(screen.win, "nowhere", "book", (shown) => said.push(shown));
  screen.paint();
  screen.scrollTo({ top: -300, bottom: -250 }, { top: 3000, bottom: 4000 });
  assert.deepEqual(said, []);
});

test("the bar on the page is the one these tests drive", () => {
  const source = readFileSync(join(process.cwd(), "src/components/StickyBookBar.tsx"), "utf8");
  assert.match(source, /useEffect\(\(\) => followBookBar\(window, heroId, bookId, setShown\), \[heroId, bookId\]\);/);
  assert.match(source, /inert=\{!shown\}/);
});

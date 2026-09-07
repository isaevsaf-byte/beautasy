/**
 * Pinning to Pinterest.
 *
 * Pinterest is a search engine that happens to look like a feed, and that is
 * the whole reason it is worth the code: an Instagram post is gone in a day,
 * a Pin is found by someone searching "handmade cotton knickers uk" nine
 * months later, and it carries a link straight to the product page. Instagram
 * carries no link at all.
 *
 * One value is required:
 *   PINTEREST_ACCESS_TOKEN  — from the Pinterest developer app, with
 *                             pins:write and boards:read
 *
 * PINTEREST_BOARD_ID is optional. Left unset, the first board on the account
 * is used, because an account with one board is the common case and asking
 * for an id nobody can find is how the Instagram connection lost half a day.
 *
 * With the token missing every call reports "not configured" rather than
 * throwing: a Pin is the second thing that happens to a post, and it must
 * never take the Instagram publish down with it.
 */

const API = "https://api.pinterest.com/v5";

/** Pinterest truncates rather than refusing, which is worse than being told. */
const TITLE_MAX = 100;
const DESCRIPTION_MAX = 800;

function token(): string | null {
  return process.env.PINTEREST_ACCESS_TOKEN?.trim() || null;
}

export function pinterestConfigured(): boolean {
  return token() !== null;
}

async function call<T>(
  path: string,
  init?: { method?: string; body?: unknown }
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const key = token();
  if (!key) return { ok: false, error: "Pinterest is not connected" };

  try {
    const res = await fetch(`${API}${path}`, {
      method: init?.method ?? "GET",
      headers: {
        Authorization: `Bearer ${key}`,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
      },
      ...(init?.body ? { body: JSON.stringify(init.body) } : {}),
      cache: "no-store",
    });

    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const message =
        (data.message as string) ??
        (data.error as string) ??
        `Pinterest returned ${res.status}`;
      return { ok: false, error: message };
    }
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, error: "Could not reach Pinterest" };
  }
}

export interface Board {
  id: string;
  name: string;
}

/** The boards this token can pin to, newest first as Pinterest returns them. */
export async function boards(): Promise<Board[]> {
  const result = await call<{ items?: { id: string; name: string }[] }>("/boards?page_size=25");
  if (!result.ok) return [];
  return (result.data.items ?? []).map((b) => ({ id: b.id, name: b.name }));
}

export interface PinterestReport {
  configured: boolean;
  username?: string;
  accountType?: string;
  /** Where Pins will actually land */
  board?: Board;
  boards?: Board[];
  error?: string;
}

/**
 * Whether pinning would work, asked without pinning anything.
 *
 * The same question as the Instagram check and for the same reason: a token
 * that expired, or one that can read but not write, looks identical from
 * outside — Pins simply stop appearing and nothing says why.
 */
export async function checkPinterest(): Promise<PinterestReport> {
  if (!pinterestConfigured()) {
    return { configured: false, error: "PINTEREST_ACCESS_TOKEN is not set" };
  }

  const account = await call<{ username?: string; account_type?: string }>("/user_account");
  if (!account.ok) return { configured: true, error: account.error };

  const found = await boards();
  const chosen = await targetBoard(found);

  return {
    configured: true,
    username: account.data.username,
    accountType: account.data.account_type,
    board: chosen ?? undefined,
    boards: found,
    error: chosen ? undefined : "This account has no board to pin to — make one in Pinterest first",
  };
}

/** The board Pins go to: the one that was chosen, or the only one there is. */
async function targetBoard(known?: Board[]): Promise<Board | null> {
  const wanted = process.env.PINTEREST_BOARD_ID?.trim();
  const list = known ?? (await boards());
  if (wanted) {
    const match = list.find((b) => b.id === wanted);
    // An id that names no board is worth honouring anyway: the account may
    // have more boards than one page, and Pinterest will say if it is wrong.
    return match ?? { id: wanted, name: "(set by PINTEREST_BOARD_ID)" };
  }
  return list[0] ?? null;
}

export interface PinResult {
  ok: boolean;
  url?: string;
  pinId?: string;
  error?: string;
  skipped?: "not-configured";
}

/**
 * Creates one Pin.
 *
 * `link` is the point of the exercise. A Pin without one is a picture on
 * somebody else's website; a Pin with one is a shop window that keeps working
 * for a year.
 */
export async function createPin(input: {
  imageUrl: string;
  title: string;
  description: string;
  link?: string;
}): Promise<PinResult> {
  if (!pinterestConfigured()) {
    return { ok: false, skipped: "not-configured", error: "Pinterest is not connected" };
  }

  const board = await targetBoard();
  if (!board) return { ok: false, error: "No board to pin to" };

  const result = await call<{ id?: string }>("/pins", {
    method: "POST",
    body: {
      board_id: board.id,
      title: input.title.slice(0, TITLE_MAX),
      description: input.description.slice(0, DESCRIPTION_MAX),
      ...(input.link ? { link: input.link } : {}),
      media_source: { source_type: "image_url", url: input.imageUrl },
    },
  });

  if (!result.ok) return { ok: false, error: result.error };

  const pinId = result.data.id ? String(result.data.id) : undefined;
  return {
    ok: true,
    pinId,
    url: pinId ? `https://www.pinterest.com/pin/${pinId}/` : undefined,
  };
}

/**
 * A Pin's title and description, which are not the Instagram caption.
 *
 * Instagram rewards a voice; Pinterest rewards words someone might type into
 * a search box. So the title is the product and the description is the
 * caption with its hashtags left off — they do nothing here and read as
 * clutter — with the shop and the town added, because "Southampton" is a
 * search people actually make.
 */
export function pinTextFrom(input: {
  productName?: string;
  caption: string;
  category?: string;
}): { title: string; description: string } {
  const title = (input.productName ?? input.caption.split("\n")[0]).replace(/\s+/g, " ").trim();

  const body = input.caption
    .split("\n")
    .filter((line) => !line.trim().startsWith("#"))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const tail = input.category
    ? `Handmade ${input.category.toLowerCase()} by Beautasy, Southampton.`
    : "Handmade by Beautasy in Southampton.";

  return {
    title: title.slice(0, TITLE_MAX),
    description: `${body}\n\n${tail}`.slice(0, DESCRIPTION_MAX),
  };
}

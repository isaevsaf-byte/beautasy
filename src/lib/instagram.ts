/**
 * Publishing a picture to Instagram.
 *
 * Uses the official Content Publishing API, which is a two-step dance: hand
 * Instagram a public image URL to build a container, then publish that
 * container. Sanity's CDN URLs are public, so the picture never has to be
 * uploaded twice.
 *
 * Meta offers two ways in, and this takes whichever the token belongs to:
 *
 *   Instagram Login   graph.instagram.com — the account signs in as itself.
 *                     No Facebook Page, no business portfolio, no Page
 *                     permissions.
 *   Facebook Login    graph.facebook.com — the older route, where the account
 *                     hangs off a Page the token can see.
 *
 * Only one value is required:
 *   IG_ACCESS_TOKEN  — falls back to META_ACCESS_TOKEN
 *
 * IG_USER_ID is optional and exists only to pin a specific account when a
 * token can reach several. Leaving it unset is the safer choice: an id typed
 * by hand is the single most common way this breaks, and every id Meta shows
 * on its dashboard — the app's, the Page's, the portfolio's — looks exactly
 * like the one that is wanted. The token already knows which account it is,
 * so we ask it rather than the person.
 *
 * With the token missing, every call reports "not configured" rather than
 * throwing — the rest of the daily job must keep running.
 */

const FACEBOOK = "https://graph.facebook.com/v21.0";
const INSTAGRAM = "https://graph.instagram.com/v21.0";

/** The Facebook graph, for the questions only it can answer (Pages, portfolios). */
const GRAPH = FACEBOOK;

export interface PublishResult {
  ok: boolean;
  permalink?: string;
  mediaId?: string;
  error?: string;
  skipped?: "not-configured";
}

function credentials(): { userId?: string; token: string } | null {
  const token = process.env.IG_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN;
  if (!token) return null;
  // Blank and whitespace-only values are what a half-filled Vercel field
  // actually contains, and they are not a configured account.
  const userId = process.env.IG_USER_ID?.trim();
  return { userId: userId || undefined, token };
}

export function instagramConfigured(): boolean {
  return credentials() !== null;
}

export interface ConnectionReport {
  configured: boolean;
  /** The account posts would actually appear on */
  username?: string;
  accountType?: string;
  /** The id that was used, whether it came from the token or the environment */
  accountId?: string;
  /** Which of Meta's two doors the token opened */
  via?: "instagram-login" | "facebook-page";
  /** Instagram allows 50 posts per rolling 24 hours */
  postsUsedToday?: number;
  postsAllowed?: number;
  error?: string;
  /** Filled in when the lookup fails: what the token is and what the id is */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  diagnosis?: any;
  /**
   * What the token can actually reach, listed when the configured id does not
   * work. Meta hands out several long numbers under the same brand name — a
   * portfolio, a Page, an account — and the only way to tell which is the
   * Instagram account is to ask the token what it sees.
   */
  candidates?: { page: string; pageId: string; instagramId?: string; username?: string }[];
}

/**
 * What Meta thinks the token is, and what the configured id actually is.
 *
 * Run only when the account lookup fails, because that failure has half a
 * dozen indistinguishable causes: a portfolio id instead of an account id, a
 * token belonging to the wrong thing, a missing permission. Asking these three
 * questions separates them. The token itself is never included in the answer.
 */
async function diagnose(creds: { userId?: string; token: string }) {
  const ask = async (path: string, query: string) => {
    try {
      const res = await fetch(`${GRAPH}/${path}?${query}&access_token=${encodeURIComponent(creds.token)}`, {
        cache: "no-store",
      });
      const body = await res.json().catch(() => ({}));
      return res.ok ? body : { error: body?.error?.message ?? `HTTP ${res.status}` };
    } catch {
      return { error: "unreachable" };
    }
  };

  const [tokenInfo, identity, object] = await Promise.all([
    ask("debug_token", `input_token=${encodeURIComponent(creds.token)}`),
    ask("me", "fields=id,name"),
    creds.userId ? ask(creds.userId, "fields=id,name,link") : Promise.resolve(undefined),
  ]);

  const data = (tokenInfo as { data?: Record<string, unknown> }).data ?? tokenInfo;
  const expiresAt = (data as { expires_at?: number }).expires_at;
  // A rejected token answers with nothing at all. Reporting "never" about it
  // would be the most confident wrong answer this endpoint could give, and it
  // points the reader at the id when the token is the thing that is broken.
  const readable = (data as { type?: string; scopes?: string[] }).type !== undefined ||
    (data as { scopes?: string[] }).scopes !== undefined;

  return {
    tokenType: (data as { type?: string }).type,
    tokenScopes: (data as { scopes?: string[] }).scopes,
    tokenExpires: !readable
      ? "unknown — Meta would not read this token"
      : expiresAt
        ? new Date(expiresAt * 1000).toISOString()
        : "never",
    tokenBelongsTo: identity,
    configuredObject: object ?? "IG_USER_ID is not set — nothing to look up",
  };
}

/**
 * The same question asked of the business portfolios.
 *
 * me/accounts only lists Pages the person granted this app directly. An
 * account owned by a business portfolio is invisible there even when every
 * permission is in place, which is exactly the case that looks like "nothing
 * is connected" while the account sits right there in Business settings.
 */
async function discoverViaBusinesses(creds: { token: string }): Promise<ConnectionReport["candidates"]> {
  const ask = async (path: string, fields: string) => {
    try {
      const res = await fetch(
        `${GRAPH}/${path}?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(creds.token)}`,
        { cache: "no-store" }
      );
      return res.ok ? await res.json() : null;
    } catch {
      return null;
    }
  };

  const businesses = (await ask("me/businesses", "id,name"))?.data ?? [];
  const found: NonNullable<ConnectionReport["candidates"]> = [];

  for (const business of businesses as { id: string; name: string }[]) {
    const detail = await ask(
      business.id,
      "name,owned_instagram_accounts{id,username},client_instagram_accounts{id,username},owned_pages{id,name,instagram_business_account{id,username}},client_pages{id,name,instagram_business_account{id,username}}"
    );
    if (!detail) continue;

    for (const key of ["owned_instagram_accounts", "client_instagram_accounts"] as const) {
      for (const account of (detail[key]?.data ?? []) as { id: string; username?: string }[]) {
        found.push({
          page: `${business.name} → ${key === "owned_instagram_accounts" ? "owned" : "client"} Instagram`,
          pageId: business.id,
          instagramId: account.id,
          username: account.username,
        });
      }
    }

    for (const key of ["owned_pages", "client_pages"] as const) {
      for (const page of (detail[key]?.data ?? []) as {
        id: string;
        name: string;
        instagram_business_account?: { id: string; username?: string };
      }[]) {
        found.push({
          page: `${business.name} → ${page.name}`,
          pageId: page.id,
          instagramId: page.instagram_business_account?.id,
          username: page.instagram_business_account?.username,
        });
      }
    }
  }

  return found;
}

/** Pages this token can reach, and the Instagram account on each. */
async function discoverAccounts(creds: { token: string }): Promise<ConnectionReport["candidates"]> {
  try {
    const res = await fetch(
      `${GRAPH}/me/accounts?fields=id,name,instagram_business_account{id,username}&access_token=${encodeURIComponent(creds.token)}`,
      { cache: "no-store" }
    );
    const body = (await res.json().catch(() => ({}))) as {
      data?: { id: string; name: string; instagram_business_account?: { id: string; username?: string } }[];
    };
    const pages = (body.data ?? []).map((page) => ({
      page: page.name,
      pageId: page.id,
      instagramId: page.instagram_business_account?.id,
      username: page.instagram_business_account?.username,
    }));
    if (pages.length > 0) return pages;
    return await discoverViaBusinesses(creds);
  } catch {
    return undefined;
  }
}


interface ResolvedAccount {
  /** Which graph answers for this account */
  base: string;
  id: string;
  username?: string;
  accountType?: string;
  via: "instagram-login" | "facebook-page";
}

/**
 * Who this token actually posts as.
 *
 * Asked of the token rather than read from configuration, because a typed id
 * has been wrong every time so far and the failure it produces — an object
 * that exists and answers but has no username — reads like a permissions
 * problem rather than a typo.
 *
 * The order matters. An Instagram Login token identifies itself in one call
 * and needs nothing else, so it is tried first. Only if that door is shut do
 * we go the long way round through Facebook: an id if one was pinned, and
 * failing that, whatever account the token's Pages lead to.
 */
async function resolveAccount(creds: {
  userId?: string;
  token: string;
}): Promise<ResolvedAccount | { error: string }> {
  const token = encodeURIComponent(creds.token);

  // 1. Instagram Login — the token says who it is
  try {
    const res = await fetch(
      `${INSTAGRAM}/me?fields=user_id,username,account_type&access_token=${token}`,
      { cache: "no-store" }
    );
    const body = (await res.json().catch(() => ({}))) as {
      user_id?: string | number;
      id?: string | number;
      username?: string;
      account_type?: string;
    };
    const id = body.user_id ?? body.id;
    if (res.ok && id && body.username) {
      return {
        base: INSTAGRAM,
        id: String(id),
        username: body.username,
        accountType: body.account_type,
        via: "instagram-login",
      };
    }
  } catch {
    // Not an Instagram Login token, or that graph is unreachable — try Facebook
  }

  // 2. Facebook Login with an id someone pinned
  let pinnedFailure: string | undefined;
  if (creds.userId) {
    try {
      const res = await fetch(
        `${FACEBOOK}/${creds.userId}?fields=username,account_type&access_token=${token}`,
        { cache: "no-store" }
      );
      const body = (await res.json().catch(() => ({}))) as {
        username?: string;
        account_type?: string;
        error?: { message?: string };
      };
      if (res.ok && body.username) {
        return {
          base: FACEBOOK,
          id: creds.userId,
          username: body.username,
          accountType: body.account_type,
          via: "facebook-page",
        };
      }
      pinnedFailure = body.error?.message ?? `Instagram returned ${res.status}`;
    } catch {
      pinnedFailure = "Could not reach Instagram";
    }
  }

  // 3. Facebook Login, working it out from the Pages the token can see
  const candidates = await discoverAccounts(creds);
  const found = candidates?.find((c) => c.instagramId);
  if (found?.instagramId) {
    return {
      base: FACEBOOK,
      id: found.instagramId,
      username: found.username,
      via: "facebook-page",
    };
  }

  return {
    error:
      pinnedFailure ??
      "This token does not belong to an Instagram account, and reaches no Page that has one",
  };
}

/**
 * Whether the connection actually works — asked without posting anything.
 *
 * Setting IG_USER_ID and IG_ACCESS_TOKEN is easy to get subtly wrong: the
 * @handle instead of the numeric id, a token for the personal account rather
 * than the business one, a token missing instagram_content_publish, or one
 * that quietly expired sixty days later. Every one of those looks identical
 * from outside — the queue simply stops posting. This asks Instagram who the
 * credentials belong to, so the answer is a username rather than a silence.
 */
export async function checkConnection(): Promise<ConnectionReport> {
  const creds = credentials();
  if (!creds) {
    return {
      configured: false,
      error: "IG_ACCESS_TOKEN (or META_ACCESS_TOKEN) is not set",
    };
  }

  const account = await resolveAccount(creds);

  if ("error" in account) {
    // Say what the token *can* see, so the answer is one line away rather
    // than another hour in Meta's console.
    const [candidates, diagnosis] = await Promise.all([discoverAccounts(creds), diagnose(creds)]);
    return { configured: true, error: account.error, candidates, diagnosis };
  }

  const report: ConnectionReport = {
    configured: true,
    username: account.username,
    accountType: account.accountType,
    accountId: account.id,
    via: account.via,
  };

  // How much of today's posting allowance is left. Never fatal.
  try {
    const quotaRes = await fetch(
      `${account.base}/${account.id}/content_publishing_limit?access_token=${encodeURIComponent(creds.token)}`,
      { cache: "no-store" }
    );
    const quota = (await quotaRes.json()) as {
      data?: { quota_usage?: number; config?: { quota_total?: number } }[];
    };
    const row = quota.data?.[0];
    if (row) {
      report.postsUsedToday = row.quota_usage;
      report.postsAllowed = row.config?.quota_total;
    }
  } catch {
    // The allowance is a nicety; the account name is the answer that matters
  }

  return report;
}

async function graphPost(
  base: string,
  path: string,
  params: Record<string, string>
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; error: string }> {
  const res = await fetch(`${base}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;

  if (!res.ok) {
    const err = data.error as { message?: string } | undefined;
    return { ok: false, error: err?.message ?? `Instagram returned ${res.status}` };
  }
  return { ok: true, data };
}

/** What a container is doing, without deciding what to do about it. */
export type ContainerState = "ready" | "working" | "failed";

async function containerState(
  base: string,
  creationId: string,
  token: string
): Promise<{ state: ContainerState; error?: string }> {
  try {
    const res = await fetch(
      `${base}/${creationId}?fields=status_code,status&access_token=${encodeURIComponent(token)}`,
      { cache: "no-store" }
    );
    const data = (await res.json().catch(() => ({}))) as { status_code?: string; status?: string };
    if (data.status_code === "FINISHED") return { state: "ready" };
    if (data.status_code === "ERROR" || data.status_code === "EXPIRED") {
      return { state: "failed", error: data.status ?? "Instagram could not process the upload" };
    }
    return { state: "working" };
  } catch {
    return { state: "working" };
  }
}

/**
 * Waits for a container, for as long as it is worth waiting.
 *
 * A photo is ready almost at once. A Reel is transcoded, which routinely takes
 * longer than the sixty seconds a Vercel function is allowed to live — so the
 * budget is passed in, and running out is reported as "still working" rather
 * than as a failure. Publishing a Reel is finished by a later run, not
 * abandoned.
 */
async function waitForContainer(
  base: string,
  creationId: string,
  token: string,
  budgetMs = 10_000
): Promise<ContainerState> {
  const until = Date.now() + budgetMs;
  let wait = 1500;
  for (;;) {
    const { state } = await containerState(base, creationId, token);
    if (state !== "working") return state;
    if (Date.now() + wait >= until) return "working";
    await new Promise((r) => setTimeout(r, wait));
    wait = Math.min(wait * 1.5, 6000);
  }
}

export interface ReelStart {
  ok: boolean;
  /** The upload Instagram is preparing. Kept so a later run can finish it. */
  creationId?: string;
  /** True when Instagram finished transcoding inside our budget */
  ready?: boolean;
  error?: string;
  skipped?: "not-configured";
}

/**
 * Begins a Reel, and finishes it only if Instagram is quick about it.
 *
 * Video is the one thing here that does not fit inside a request. Instagram
 * transcodes before it will publish, and that regularly outlasts the sixty
 * seconds a function on this plan is given — so this is deliberately two
 * halves. Starting the upload always succeeds or fails cleanly; whether the
 * publish happens now or on the next run is Instagram's business, not the
 * caller's.
 *
 * The cover comes from the post's own picture, so a Reel opens on a frame
 * Kristina chose rather than whatever the first frame happens to be.
 */
export async function startReel(
  videoUrl: string,
  caption: string,
  coverUrl?: string,
  budgetMs = 35_000
): Promise<ReelStart> {
  const creds = credentials();
  if (!creds) return { ok: false, skipped: "not-configured", error: "Instagram is not connected" };

  const account = await resolveAccount(creds);
  if ("error" in account) return { ok: false, error: account.error };

  const container = await graphPost(account.base, `${account.id}/media`, {
    media_type: "REELS",
    video_url: videoUrl,
    caption,
    // Without this a Reel appears only under the Reels tab, and the people who
    // already follow the shop never see it in their feed.
    share_to_feed: "true",
    ...(coverUrl ? { cover_url: coverUrl } : {}),
    access_token: creds.token,
  });
  if (!container.ok) return { ok: false, error: container.error };

  const creationId = String(container.data.id ?? "");
  if (!creationId) return { ok: false, error: "Instagram did not return a container id" };

  const state = await waitForContainer(account.base, creationId, creds.token, budgetMs);
  if (state === "failed") return { ok: false, creationId, error: "Instagram could not process the video" };

  return { ok: true, creationId, ready: state === "ready" };
}

/**
 * Publishes a container that is already prepared — the second half of a Reel,
 * and the whole of resuming one that was still transcoding last time.
 */
export async function finishReel(creationId: string): Promise<PublishResult> {
  const creds = credentials();
  if (!creds) return { ok: false, skipped: "not-configured", error: "Instagram is not connected" };

  const account = await resolveAccount(creds);
  if ("error" in account) return { ok: false, error: account.error };

  const state = await waitForContainer(account.base, creationId, creds.token, 8_000);
  if (state === "failed") return { ok: false, error: "Instagram could not process the video" };
  if (state === "working") return { ok: false, error: "still-processing" };

  const published = await graphPost(account.base, `${account.id}/media_publish`, {
    creation_id: creationId,
    access_token: creds.token,
  });
  if (!published.ok) return { ok: false, error: published.error };

  const mediaId = String(published.data.id ?? "");
  let permalink: string | undefined;
  try {
    const res = await fetch(
      `${account.base}/${mediaId}?fields=permalink&access_token=${encodeURIComponent(creds.token)}`
    );
    permalink = ((await res.json()) as { permalink?: string }).permalink;
  } catch {
    permalink = undefined;
  }

  return { ok: true, mediaId, permalink };
}

/**
 * Posts one picture with its caption. Returns the permalink so the Studio can
 * link straight to the published post.
 */
export async function publishToInstagram(
  imageUrl: string,
  caption: string
): Promise<PublishResult> {
  const creds = credentials();
  if (!creds) return { ok: false, skipped: "not-configured", error: "Instagram is not connected" };

  const account = await resolveAccount(creds);
  if ("error" in account) return { ok: false, error: account.error };

  const container = await graphPost(account.base, `${account.id}/media`, {
    image_url: imageUrl,
    caption,
    access_token: creds.token,
  });
  if (!container.ok) return { ok: false, error: container.error };

  const creationId = String(container.data.id ?? "");
  if (!creationId) return { ok: false, error: "Instagram did not return a container id" };

  const state = await waitForContainer(account.base, creationId, creds.token);
  if (state === "failed") return { ok: false, error: "Instagram could not process the picture" };
  if (state === "working") return { ok: false, error: "The picture was still processing" };

  const published = await graphPost(account.base, `${account.id}/media_publish`, {
    creation_id: creationId,
    access_token: creds.token,
  });
  if (!published.ok) return { ok: false, error: published.error };

  const mediaId = String(published.data.id ?? "");

  // The permalink is a nicety — a post that went out but whose link we failed
  // to read is still a published post.
  let permalink: string | undefined;
  try {
    const res = await fetch(
      `${account.base}/${mediaId}?fields=permalink&access_token=${encodeURIComponent(creds.token)}`
    );
    const data = (await res.json()) as { permalink?: string };
    permalink = data.permalink;
  } catch {
    permalink = undefined;
  }

  return { ok: true, mediaId, permalink };
}

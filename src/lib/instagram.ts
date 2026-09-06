/**
 * Publishing a picture to Instagram.
 *
 * Uses the official Content Publishing API, which is a two-step dance: hand
 * Instagram a public image URL to build a container, then publish that
 * container. Sanity's CDN URLs are public, so the picture never has to be
 * uploaded twice.
 *
 * Needs a Business or Creator Instagram account linked to a Facebook Page,
 * and two values in the environment:
 *   IG_USER_ID       — the Instagram *business account* id (not the @handle)
 *   IG_ACCESS_TOKEN  — a long-lived Page token with instagram_content_publish
 *                      (falls back to META_ACCESS_TOKEN, the catalogue token,
 *                      when it carries the same permission)
 *
 * With either missing, every call reports "not configured" rather than
 * throwing — the rest of the daily job must keep running.
 */

const GRAPH = "https://graph.facebook.com/v21.0";

export interface PublishResult {
  ok: boolean;
  permalink?: string;
  mediaId?: string;
  error?: string;
  skipped?: "not-configured";
}

function credentials(): { userId: string; token: string } | null {
  const userId = process.env.IG_USER_ID;
  const token = process.env.IG_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN;
  if (!userId || !token) return null;
  return { userId, token };
}

export function instagramConfigured(): boolean {
  return credentials() !== null;
}

export interface ConnectionReport {
  configured: boolean;
  /** The account posts would actually appear on */
  username?: string;
  accountType?: string;
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
async function diagnose(creds: { userId: string; token: string }) {
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
    ask(creds.userId, "fields=id,name,link"),
  ]);

  const data = (tokenInfo as { data?: Record<string, unknown> }).data ?? tokenInfo;

  return {
    tokenType: (data as { type?: string }).type,
    tokenScopes: (data as { scopes?: string[] }).scopes,
    tokenExpires: (data as { expires_at?: number }).expires_at
      ? new Date(((data as { expires_at: number }).expires_at) * 1000).toISOString()
      : "never",
    tokenBelongsTo: identity,
    configuredObject: object,
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
      error: "IG_USER_ID and IG_ACCESS_TOKEN are not set",
    };
  }

  try {
    const res = await fetch(
      `${GRAPH}/${creds.userId}?fields=username,account_type&access_token=${encodeURIComponent(creds.token)}`,
      { cache: "no-store" }
    );
    const data = (await res.json().catch(() => ({}))) as {
      username?: string;
      account_type?: string;
      error?: { message?: string };
    };

    if (!res.ok) {
      // The id is wrong or invisible. Say what the token *can* see, so the
      // right id is one line away rather than another hour in Meta's console.
      const [candidates, diagnosis] = await Promise.all([
        discoverAccounts(creds),
        diagnose(creds),
      ]);
      return {
        configured: true,
        error: data.error?.message ?? `Instagram returned ${res.status}`,
        candidates,
        diagnosis,
      };
    }

    const report: ConnectionReport = {
      configured: true,
      username: data.username,
      accountType: data.account_type,
    };

    // How much of today's posting allowance is left. Never fatal.
    try {
      const quotaRes = await fetch(
        `${GRAPH}/${creds.userId}/content_publishing_limit?access_token=${encodeURIComponent(creds.token)}`,
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
  } catch (error) {
    return {
      configured: true,
      error: error instanceof Error ? error.message : "Could not reach Instagram",
    };
  }
}

async function graphPost(
  path: string,
  params: Record<string, string>
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; error: string }> {
  const res = await fetch(`${GRAPH}/${path}`, {
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

/** Containers are usually ready at once, but a large image can take a moment. */
async function waitForContainer(
  creationId: string,
  token: string,
  attempts = 5
): Promise<string | null> {
  for (let i = 0; i < attempts; i++) {
    const res = await fetch(
      `${GRAPH}/${creationId}?fields=status_code&access_token=${encodeURIComponent(token)}`
    );
    const data = (await res.json().catch(() => ({}))) as { status_code?: string };
    if (data.status_code === "FINISHED") return null;
    if (data.status_code === "ERROR") return "Instagram could not process the picture";
    await new Promise((r) => setTimeout(r, 2000));
  }
  return "The picture was still processing after 10 seconds";
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

  const container = await graphPost(`${creds.userId}/media`, {
    image_url: imageUrl,
    caption,
    access_token: creds.token,
  });
  if (!container.ok) return { ok: false, error: container.error };

  const creationId = String(container.data.id ?? "");
  if (!creationId) return { ok: false, error: "Instagram did not return a container id" };

  const notReady = await waitForContainer(creationId, creds.token);
  if (notReady) return { ok: false, error: notReady };

  const published = await graphPost(`${creds.userId}/media_publish`, {
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
      `${GRAPH}/${mediaId}?fields=permalink&access_token=${encodeURIComponent(creds.token)}`
    );
    const data = (await res.json()) as { permalink?: string };
    permalink = data.permalink;
  } catch {
    permalink = undefined;
  }

  return { ok: true, mediaId, permalink };
}

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

import { sanityConfig } from "@/lib/sanity";

/**
 * Is the person asking actually Kristina, or someone she works with?
 *
 * The Studio has nowhere to keep a secret of its own — it is a page in the
 * browser — so the routes it calls cannot be protected by one. What it does
 * have is the session token it is already using to talk to Sanity, and that
 * token can be spent on a single question to Sanity's management API: this
 * project, and who on it is asking.
 *
 * "Who" matters, not just "any answer at all". Sanity answers the project
 * question for every token that belongs to it, and that includes robot
 * tokens: the site's own write token, and a read-only token made once for CI.
 * Neither is a person, and a read-only token opening every sealed contact
 * through /api/studio/reveal is exactly what sealing them was meant to stop.
 * So the caller must be a human member with a role that edits content —
 * administrator or editor. A viewer can look at the Studio; it cannot open
 * customers' details, write the ledger or book the diary through these doors.
 *
 * The token is never stored, never logged and never used for anything else.
 *
 * 🚨 This, and not `fromThisSite`, is what actually guards a route. An Origin
 * header is one line of curl; only this asks Sanity who the caller is. Any
 * route that answers with something Kristina would not put on a poster —
 * takings, order counts, visitor numbers — needs this one as well.
 */
const MANAGEMENT_API = "https://api.sanity.io/v2021-06-07";

/** The roles that edit content. Viewer, and anything custom, is not enough. */
export const STUDIO_ROLES = ["administrator", "editor"] as const;

/**
 * Is this string shaped like a Sanity token at all?
 *
 * Not the security check — the request below is. This is here so that rubbish
 * is thrown away without spending an outgoing request on it. A route that
 * calls this can be reached by anyone willing to forge an Origin header, and
 * without this line they can make the site ask api.sanity.io about a string of
 * their choosing, over and over, with Vercel's address on the request rather
 * than their own: a slow, free, anonymous way to sort stolen tokens from dead
 * ones. Deliberately loose, because the cost of turning away a real token is
 * Kristina locked out of her own numbers, and the cost of letting a wrong one
 * through is one request Sanity answers with 401.
 */
export function looksLikeAToken(value: string): boolean {
  return value.length >= 20 && value.length <= 500 && /^[A-Za-z0-9._-]+$/.test(value);
}

/**
 * How long Sanity gets to answer before the caller is turned away.
 *
 * Without a deadline this fetch inherits undici's, which is five minutes —
 * measured against a socket that accepts and never replies, it was still
 * waiting after twenty seconds. The route that calls this runs inside a
 * function Vercel kills at sixty, so a silent socket here does not fail the
 * check, it fails the whole request with a gateway error. Five seconds is
 * long enough for a management API that normally answers in under one, and
 * short enough to leave the route time to say something useful instead.
 */
export const MEMBERSHIP_TIMEOUT_MS = 5_000;

/** One entry of the project's member list, as much of it as is read here. */
export interface ProjectMember {
  id?: unknown;
  isRobot?: unknown;
  isCurrentUser?: unknown;
  role?: unknown;
  roles?: unknown;
}

/** Every role a member holds, whether Sanity spells it as a name or as { name }. */
function rolesOf(member: ProjectMember): string[] {
  const names: string[] = [];
  if (typeof member.role === "string") names.push(member.role);
  if (Array.isArray(member.roles)) {
    for (const role of member.roles) {
      if (typeof role === "string") names.push(role);
      else if (role && typeof (role as { name?: unknown }).name === "string") {
        names.push((role as { name: string }).name);
      }
    }
  }
  return names;
}

/**
 * Whether this member may use the Studio's routes: a person, not a robot, with
 * a role that edits. `isRobot` has to say false in so many words — a member
 * whose entry leaves it out is not assumed to be human.
 */
export function mayUseStudioRoutes(member: ProjectMember | null | undefined): boolean {
  if (!member || member.isRobot !== false) return false;
  return rolesOf(member).some((role) => (STUDIO_ROLES as readonly string[]).includes(role));
}

function membersOf(project: unknown): ProjectMember[] {
  const members = (project as { members?: unknown } | null)?.members;
  return Array.isArray(members)
    ? members.filter((member): member is ProjectMember => !!member && typeof member === "object")
    : [];
}

/**
 * `ask` exists so a test can exercise what this returns rather than grep for
 * the call. The check is the only real door on the numbers route, and a
 * mutation turning it into `return true` used to leave the whole suite green.
 *
 * One question normally answers it: the project's member list marks the
 * caller with `isCurrentUser`. Should an answer ever come back without that
 * mark, Sanity is asked who the token belongs to (/users/me) and the member is
 * found by id — a second request inside the same five seconds, rather than
 * Kristina locked out of her own Studio tools by a change of shape.
 */
export async function isProjectMember(
  token: string,
  ask: typeof fetch = fetch
): Promise<boolean> {
  if (!looksLikeAToken(token)) return false;
  // One deadline for the whole check, however many questions it takes
  const signal = AbortSignal.timeout(MEMBERSHIP_TIMEOUT_MS);
  const question = (path: string) =>
    ask(`${MANAGEMENT_API}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal,
    });
  try {
    const res = await question(`/projects/${sanityConfig.projectId}`);
    if (!res.ok) return false;
    const members = membersOf(await res.json());

    const marked = members.find((member) => member.isCurrentUser === true);
    if (marked) return mayUseStudioRoutes(marked);

    const meRes = await question("/users/me");
    if (!meRes.ok) return false;
    const me = (await meRes.json()) as { id?: unknown } | null;
    const id = typeof me?.id === "string" && me.id ? me.id : null;
    return !!id && mayUseStudioRoutes(members.find((member) => member.id === id));
  } catch {
    return false;
  }
}

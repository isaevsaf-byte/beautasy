import { auth } from "@clerk/nextjs/server";
import { clerkEnabled } from "@/lib/clerk";

/**
 * The signed-in visitor's Clerk id, or null — and it never throws.
 *
 * Accounts are optional in this shop: guests buy, and a signed-in customer
 * only gets the extra of seeing the order under "My Orders". So nothing that
 * takes money may fail because Clerk is switched off or unreachable.
 *
 * Clerk's `auth()` throws when `clerkMiddleware()` did not run, which is
 * exactly the case when NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is unset and the
 * middleware is the no-op. With the key set but Clerk's backend down, it can
 * also reject. Either way the right answer for the shop is "treat as guest".
 *
 * This is the only file allowed to import `auth` from @clerk/nextjs/server —
 * clerkServer.test.ts enforces it, so the guard cannot be bypassed by accident.
 */
export async function currentUserId(): Promise<string | null> {
  if (!clerkEnabled) return null;
  try {
    const { userId } = await auth();
    return userId ?? null;
  } catch (err) {
    console.error("Clerk auth() failed — continuing as a guest:", err);
    return null;
  }
}

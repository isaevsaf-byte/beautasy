/**
 * Whether Clerk is configured for this deployment.
 *
 * Accounts are optional here: the shop sells to guests, and the middleware, the
 * root layout and the header all check this before reaching for Clerk. Without
 * the key there is no `<ClerkProvider>` in the tree, and any Clerk hook called
 * underneath it throws — taking the whole route into the error boundary rather
 * than degrading. So anything that calls a Clerk hook has to check first.
 *
 * The check lives here rather than being re-derived per file so the four places
 * that need it cannot drift apart. Next inlines `NEXT_PUBLIC_*` at build time,
 * so this is a constant in the client bundle, not a runtime lookup.
 */
export const clerkEnabled = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

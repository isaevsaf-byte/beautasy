import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * True once the component is running in the browser, false during SSR and the
 * first hydration pass.
 *
 * Use this instead of `useEffect(() => setMounted(true), [])`: that pattern
 * triggers an extra render pass and React 19's lint rules flag it. It's needed
 * wherever we read a browser-only source — `document` for a portal, or a
 * localStorage-backed Zustand store whose value would otherwise differ between
 * the server HTML and the client.
 */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  );
}

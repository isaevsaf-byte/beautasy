"use client";

import { useEffect } from "react";
import { writeReferralCookie } from "@/lib/friendsLink";
import { trackReferralLand } from "@/lib/analytics";

/**
 * Keeps the friend's code on this device for thirty days, so the bag and the
 * booking form can apply it without anyone typing. Set in the browser rather
 * than by the server so the landing page stays a plain page: no redirect, and
 * the URL the friend was sent stays in the address bar.
 */
export default function RememberReferral({ code }: { code: string }) {
  useEffect(() => {
    writeReferralCookie(code);
    trackReferralLand();
  }, [code]);
  return null;
}

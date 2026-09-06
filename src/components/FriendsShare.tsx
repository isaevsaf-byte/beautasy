"use client";

import { useState } from "react";
import { Check, Copy, MessageCircle } from "lucide-react";
import { referralLink, whatsappShareUrl } from "@/lib/friendsLink";
import { trackReferralShare } from "@/lib/analytics";

/**
 * Someone's own Beautasy Friends link, with the two ways people actually
 * share things: WhatsApp with the message already written, and copying the
 * link for everywhere else. Sits on the thank-you page after an order and on
 * /refer once a link has been made.
 */
export default function FriendsShare({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const link = referralLink(code);
  const shown = link.replace(/^https?:\/\/(www\.)?/, "");

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      trackReferralShare("copy");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // No clipboard access: the link is selectable text right above
    }
  }

  return (
    <div className="text-left">
      <p className="text-[11px] tracking-wider uppercase text-charcoal-light mb-1.5">Your link</p>
      <p className="font-mono text-sm text-charcoal break-all select-all bg-white/70 border border-lavender-soft/40 rounded-xl px-4 py-3">
        {shown}
      </p>
      <div className="flex flex-wrap gap-2 mt-3">
        <a
          href={whatsappShareUrl(code)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackReferralShare("whatsapp")}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-lavender text-charcoal rounded-full text-xs tracking-wider uppercase font-medium hover:bg-[#CFC0F0] transition-colors"
        >
          <MessageCircle size={14} aria-hidden="true" />
          Share on WhatsApp
        </a>
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-2 px-5 py-2.5 border border-charcoal/20 text-charcoal rounded-full text-xs tracking-wider uppercase font-medium hover:border-lavender hover:bg-lavender/10 transition-colors"
        >
          {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
    </div>
  );
}

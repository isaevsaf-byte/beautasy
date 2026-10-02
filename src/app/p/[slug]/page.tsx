import type { Metadata } from "next";
import { cache } from "react";
import Link from "next/link";
import { ArrowRight, MessageCircle, Scissors, ShoppingBag } from "lucide-react";
import HeaderWrapper from "@/components/HeaderWrapper";
import FooterWrapper from "@/components/FooterWrapper";
import { referralSettings, revealReferralCode } from "@/lib/referrals";
import { findPartnerBySlug } from "@/lib/partnerStore";
import { REFERRAL_COOKIE_DAYS, pounds } from "@/lib/friendsLink";
import { isPartnerSlug, partnerWhatsappText } from "@/lib/partners";
import { BUSINESS, whatsappLink } from "@/lib/business";
import RememberReferral from "../../r/[code]/RememberReferral";

/**
 * Where a partner's card lands: /p/the-hair-lounge.
 *
 * "The Hair Lounge recommends Kristina", the £5 off, and two doors — the
 * atelier first, because that is what a salon's client came for. Behind it
 * is the partner's Beautasy Friends link: the page leaves its code on the
 * device exactly as /r/CODE does, so the booking form and the bag apply the
 * £5 and the partner is credited, with nothing new on the way.
 *
 * Personal to whoever scanned it, so it asks not to be indexed; a paused or
 * unknown link gets a page that says so without saying which it is.
 */

export const dynamic = "force-dynamic";

/** Asked by the page and by its metadata: one look in the database per view, not two. */
const partnerFor = cache(async (slug: string) => (isPartnerSlug(slug) ? findPartnerBySlug(slug).catch(() => null) : null));

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const partner = await partnerFor(slug);
  return {
    title: partner ? `${partner.partner.name} recommends Beautasy Atelier` : "A recommendation | Beautasy",
    description: "Alterations and repairs by appointment in Southampton, with £5 off your first alteration.",
    robots: { index: false, follow: true },
  };
}

export default async function PartnerLandingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [settings, partner] = await Promise.all([referralSettings(), partnerFor(slug)]);
  const code = partner ? revealReferralCode(partner) : null;
  const live = settings.enabled && !!partner && partner.active !== false && !!code;
  const name = partner?.partner.name ?? "A local business";
  const atelierOff = pounds(settings.friendAtelierDiscount);
  const shopOff = pounds(settings.friendShopDiscount);
  const minBasket = settings.friendMinBasket > 0 ? ` over ${pounds(settings.friendMinBasket)}` : "";

  return (
    <>
      <HeaderWrapper />
      <main className="pt-28">
        {live && code && <RememberReferral code={code} />}

        <section className="py-16 md:py-24">
          <div className="max-w-3xl mx-auto px-6 text-center">
            <p className="text-sm tracking-[0.25em] uppercase text-charcoal-light mb-4">
              {live ? `Recommended by ${name}` : "Beautasy Atelier"}
            </p>
            <h1 className="font-serif text-4xl sm:text-5xl mb-6 leading-tight">
              {live ? (
                <>
                  <span className="italic text-lavender">{atelierOff} off</span> your first alteration
                </>
              ) : (
                "This link isn't active"
              )}
            </h1>
            <p className="text-lg text-charcoal-light max-w-xl mx-auto leading-relaxed">
              {live
                ? `${name} sends their clients to Kristina for alterations and repairs in Southampton — hems, zips, take-ins, wedding and prom dresses, curtains. Pinned on you and priced before she starts. Your ${atelierOff} is kept on this device for ${REFERRAL_COOKIE_DAYS} days.`
                : "It may have been paused. You're still very welcome — book a fitting or say hello on WhatsApp."}
            </p>
          </div>

          <div className="max-w-3xl mx-auto px-6 mt-12 grid sm:grid-cols-2 gap-5">
            <Link
              href="/atelier#book"
              className="group bg-white/70 border border-lavender-soft/40 rounded-3xl p-7 hover:shadow-xl hover:shadow-lavender/10 transition-all duration-300"
            >
              <div className="w-11 h-11 rounded-2xl bg-lavender/20 flex items-center justify-center mb-5">
                <Scissors size={20} className="text-charcoal" aria-hidden="true" />
              </div>
              <h2 className="font-serif text-2xl mb-2">Book a fitting</h2>
              <p className="text-sm text-charcoal-light leading-relaxed mb-5">
                {live
                  ? `${atelierOff} off your first alteration. It's noted when you book, and Kristina takes it off when you pay.`
                  : `Alterations and repairs, by appointment. ${BUSINESS.hours.label}.`}
              </p>
              <span className="inline-flex items-center gap-2 text-xs tracking-wider uppercase font-medium text-charcoal">
                Choose a time
                <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" aria-hidden="true" />
              </span>
            </Link>

            <a
              href={whatsappLink(live ? partnerWhatsappText(name) : "Hi Kristina! I'd love to ask about an alteration.")}
              target="_blank"
              rel="noopener noreferrer"
              className="group bg-white/70 border border-lavender-soft/40 rounded-3xl p-7 hover:shadow-xl hover:shadow-lavender/10 transition-all duration-300"
            >
              <div className="w-11 h-11 rounded-2xl bg-lavender/20 flex items-center justify-center mb-5">
                <MessageCircle size={20} className="text-charcoal" aria-hidden="true" />
              </div>
              <h2 className="font-serif text-2xl mb-2">Ask on WhatsApp</h2>
              <p className="text-sm text-charcoal-light leading-relaxed mb-5">
                {live
                  ? `Send a photo of what needs doing and get a price. Say ${name} sent you, and the ${atelierOff} is yours too.`
                  : "Send a photo of what needs doing and get a price."}
              </p>
              <span className="inline-flex items-center gap-2 text-xs tracking-wider uppercase font-medium text-charcoal">
                Message Kristina
                <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" aria-hidden="true" />
              </span>
            </a>
          </div>

          {live && (
            <p className="max-w-xl mx-auto px-6 mt-8 text-center text-sm text-charcoal-light leading-relaxed">
              <ShoppingBag size={14} className="inline -mt-0.5 mr-1" aria-hidden="true" />
              Kristina also makes lingerie, kids&apos; pieces and accessories by hand —{" "}
              <Link href="/shop" className="underline underline-offset-2 hover:text-charcoal">
                {shopOff} off your first order{minBasket}
              </Link>
              .
            </p>
          )}

          <p className="max-w-xl mx-auto px-6 mt-6 text-center text-xs text-charcoal-light leading-relaxed">
            {live
              ? "One discount per person — a first visit or a first order — and it can't be combined with other codes. "
              : ""}
            <Link href="/atelier" className="underline underline-offset-2 hover:text-charcoal">
              Prices and how it works
            </Link>
          </p>
        </section>
      </main>
      <FooterWrapper />
    </>
  );
}

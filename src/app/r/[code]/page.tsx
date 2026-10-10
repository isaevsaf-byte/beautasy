import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Scissors, ShoppingBag } from "lucide-react";
import HeaderWrapper from "@/components/HeaderWrapper";
import FooterWrapper from "@/components/FooterWrapper";
import { findReferrerByCode, referralSettings } from "@/lib/referrals";
import { REFERRAL_COOKIE_DAYS, normaliseReferralCode, pounds } from "@/lib/friendsLink";
import RememberReferral from "./RememberReferral";
import { BUSINESS } from "@/lib/business";
import { SITE_URL } from "@/lib/site";
import { ATELIER_CARD_IMAGES } from "@/lib/socialCard";

/**
 * Where a friend's link lands: /r/ANNA-K7P2.
 *
 * "Anna sent you £5", then two doors — the shop and the atelier — because the
 * programme is one link for both. The page is personal to whoever was sent it,
 * so it asks not to be indexed, and a code that no longer works gets a page
 * that says so without revealing whether it ever existed.
 */

export const dynamic = "force-dynamic";

/**
 * What the link shows when it is pasted into a chat. It used to inherit the
 * home page's lingerie card and the home page's address as og:url, so
 * WhatsApp previewed a friend's £5 as "Handmade Lingerie & Accessories" and
 * Facebook could fold the link into the home page — where no discount is
 * remembered. Now it carries its own address and says what it is for: the
 * atelier, which is what most friends are sent for.
 */
export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  const settings = await referralSettings();
  const shareTitle = settings.enabled
    ? `${pounds(settings.friendAtelierDiscount)} off your first alteration — Beautasy Atelier`
    : "Beautasy Atelier — alterations & repairs in Southampton";
  const shareDescription = settings.enabled
    ? "A friend has sent you money off your first alteration at Beautasy's Southampton atelier, or off your first order from the handmade shop."
    : "Alterations and repairs by appointment in Southampton, and a small shop of handmade lingerie.";
  return {
    title: "A gift from a friend | Beautasy",
    description:
      "A friend has sent you money off your first Beautasy order or your first alteration at the Southampton atelier.",
    robots: { index: false, follow: true },
    openGraph: {
      title: shareTitle,
      description: shareDescription,
      url: `${SITE_URL}/r/${encodeURIComponent(code)}`,
      siteName: "Beautasy",
      locale: "en_GB",
      type: "website",
      images: ATELIER_CARD_IMAGES,
    },
    twitter: {
      card: "summary_large_image",
      title: shareTitle,
      description: shareDescription,
      // No images: with the key absent Next copies the Open Graph ones here.
    },
  };
}

export default async function FriendLandingPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const [settings, referrer] = await Promise.all([
    referralSettings(),
    findReferrerByCode(code).catch(() => null),
  ]);
  const live = settings.enabled && !!referrer && referrer.active !== false;
  const name = referrer?.displayName ?? "A friend";
  const shopOff = pounds(settings.friendShopDiscount);
  const atelierOff = pounds(settings.friendAtelierDiscount);
  const minBasket = settings.friendMinBasket > 0 ? ` over ${pounds(settings.friendMinBasket)}` : "";

  return (
    <>
      <HeaderWrapper />
      <main className="pt-28">
        {live && <RememberReferral code={normaliseReferralCode(code)} />}

        <section className="py-16 md:py-24">
          <div className="max-w-3xl mx-auto px-6 text-center">
            <p className="text-sm tracking-eyebrow uppercase text-charcoal-light mb-4">Beautasy Friends</p>
            <h1 className="font-serif text-4xl sm:text-5xl mb-6 leading-tight">
              {live ? (
                <>
                  {name} sent you <span className="italic text-lavender">{shopOff}</span>
                </>
              ) : (
                "This link isn't active"
              )}
            </h1>
            <p className="text-lg text-charcoal-light max-w-xl mx-auto leading-relaxed">
              {live
                ? `Beautasy makes lingerie, kids' pieces and accessories by hand in Southampton, and alters the clothes you already own. Your ${shopOff} is kept on this device for ${REFERRAL_COOKIE_DAYS} days — use it through either door.`
                : "The friend who shared it may have paused it, or the programme is taking a break. You're still very welcome, and you can get a link of your own below."}
            </p>
          </div>

          <div className="max-w-3xl mx-auto px-6 mt-12 grid sm:grid-cols-2 gap-5">
            <Link
              href="/shop"
              className="group bg-white/70 border border-lavender-soft/40 rounded-3xl p-7 hover:shadow-xl hover:shadow-lavender/10 transition-[background-color,border-color,box-shadow,color] duration-300"
            >
              <div className="w-11 h-11 rounded-2xl bg-lavender/20 flex items-center justify-center mb-5">
                <ShoppingBag size={20} className="text-charcoal" aria-hidden="true" />
              </div>
              <h2 className="font-serif text-2xl mb-2">Shop handmade pieces</h2>
              <p className="text-sm text-charcoal-light leading-relaxed mb-5">
                {live
                  ? `${shopOff} off your first order${minBasket}. It's already in your bag — nothing to type.`
                  : "Lingerie, kids' pieces and accessories, each one sewn to order."}
              </p>
              <span className="inline-flex items-center gap-2 text-xs tracking-wider uppercase font-medium text-charcoal">
                Browse the shop
                <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" aria-hidden="true" />
              </span>
            </Link>

            <Link
              href="/atelier#book"
              className="group bg-white/70 border border-lavender-soft/40 rounded-3xl p-7 hover:shadow-xl hover:shadow-lavender/10 transition-[background-color,border-color,box-shadow,color] duration-300"
            >
              <div className="w-11 h-11 rounded-2xl bg-lavender/20 flex items-center justify-center mb-5">
                <Scissors size={20} className="text-charcoal" aria-hidden="true" />
              </div>
              <h2 className="font-serif text-2xl mb-2">Book a fitting in Southampton</h2>
              <p className="text-sm text-charcoal-light leading-relaxed mb-5">
                {live
                  ? `${atelierOff} off your first alteration. Kristina takes it off when you pay.`
                  : `Alterations and repairs, by appointment. ${BUSINESS.hours.label}.`}
              </p>
              <span className="inline-flex items-center gap-2 text-xs tracking-wider uppercase font-medium text-charcoal">
                Choose a time
                <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" aria-hidden="true" />
              </span>
            </Link>
          </div>

          <p className="max-w-xl mx-auto px-6 mt-10 text-center text-xs text-charcoal-light leading-relaxed">
            {live
              ? "One friend discount per person — a first order or a first visit — and it can't be combined with other codes. "
              : ""}
            <Link href="/refer" className="underline underline-offset-2 hover:text-charcoal">
              How Beautasy Friends works
            </Link>
          </p>
        </section>
      </main>
      <FooterWrapper />
    </>
  );
}

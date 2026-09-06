import type { Metadata } from "next";
import Link from "next/link";
import HeaderWrapper from "@/components/HeaderWrapper";
import FooterWrapper from "@/components/FooterWrapper";
import { referralSettings } from "@/lib/referrals";
import { pounds } from "@/lib/friendsLink";
import { SITE_URL } from "@/lib/site";
import ReferForm from "./ReferForm";

/**
 * Beautasy Friends, explained, with the form that mints a link.
 *
 * This is the door for people who have not bought yet — Instagram followers,
 * the atelier's regulars, anyone who was handed a card — which, with the shop
 * this young, is most of the people who will ever share a link.
 */

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Give £5, get £5 | Beautasy Friends",
  description:
    "Share your Beautasy link. Friends get £5 off their first order or first alteration; you get £5 of credit to spend in the shop or at the Southampton atelier.",
  alternates: { canonical: `${SITE_URL}/refer` },
  openGraph: {
    title: "Give £5, get £5 — Beautasy Friends",
    description:
      "Friends get £5 off their first order or first alteration. You get £5 of Beautasy credit every time one of them buys or books.",
    url: `${SITE_URL}/refer`,
    siteName: "Beautasy",
    locale: "en_GB",
    type: "website",
  },
};

export default async function ReferPage() {
  const settings = await referralSettings();
  const give = pounds(settings.friendShopDiscount);
  const giveAtelier = pounds(settings.friendAtelierDiscount);
  const get = pounds(settings.referrerReward);
  const min = settings.friendMinBasket > 0 ? ` (on a basket of ${pounds(settings.friendMinBasket)} or more)` : "";

  const steps = [
    {
      title: "Get your link",
      text: "A first name and an email — it's made on the spot and emailed to you. No account, no app.",
    },
    {
      title: "Share it",
      text: `Friends who open it get ${give} off their first order${min}, or ${giveAtelier} off their first alteration at the atelier.`,
    },
    {
      title: "Spend your credit",
      text: `Every time one of them buys or books, ${get} lands on your Beautasy credit. Enter the code in your bag, or tell Kristina at the atelier.`,
    },
  ];

  const faqs = [
    {
      q: "Who counts as a friend?",
      a: "Anyone placing their first order with us, or coming to the atelier for the first time. We check by email, so a returning customer can't use a friend's link — and you can't use your own.",
    },
    {
      q: "Where do I spend the credit?",
      a: "In your bag at checkout, where it works like a gift card, or at the atelier — just tell Kristina. It doesn't have to be spent all at once.",
    },
    {
      q: "How long does it last?",
      a: `${settings.creditValidityMonths} months from the last time it was topped up. Every new friend restarts the clock.`,
    },
    {
      q: "Any small print?",
      a: `One friend discount per person, not combined with other codes. Credit is spent with us rather than paid out, and up to ${settings.maxRewardsPerYear} friends a year can earn it for you.`,
    },
  ];

  return (
    <>
      <HeaderWrapper />
      <main className="pt-28">
        <section className="py-16 md:py-24">
          <div className="max-w-6xl mx-auto px-6">
            <div className="text-center mb-14">
              <p className="text-sm tracking-[0.25em] uppercase text-charcoal-light mb-4">Beautasy Friends</p>
              <h1 className="font-serif text-4xl sm:text-5xl mb-6">
                Give {give}, <span className="italic text-lavender">get {get}.</span>
              </h1>
              <p className="text-lg text-charcoal-light max-w-xl mx-auto leading-relaxed">
                Share your link. Friends get {give} off their first order or first alteration. You get {get} of
                Beautasy credit every time one of them buys or books — to spend in the shop or at the atelier.
              </p>
            </div>

            {settings.enabled ? (
              <div className="max-w-2xl mx-auto">
                <ReferForm />
              </div>
            ) : (
              <div className="max-w-2xl mx-auto bg-lavender-bg rounded-3xl p-8 text-center">
                <p className="font-serif text-xl mb-2">Taking a short break</p>
                <p className="text-sm text-charcoal-light">
                  Beautasy Friends is paused for the moment. Existing credit still spends as usual.
                </p>
              </div>
            )}

            <div className="max-w-4xl mx-auto mt-20 grid sm:grid-cols-3 gap-8 md:gap-6">
              {steps.map((s, i) => (
                <div key={s.title} className="relative text-center bg-white/70 rounded-3xl px-7 py-9 border border-lavender-soft/30">
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-lavender text-charcoal w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold tracking-wide">
                    {String(i + 1).padStart(2, "0")}
                  </div>
                  <h2 className="font-serif text-xl mb-2 mt-1">{s.title}</h2>
                  <p className="text-sm text-charcoal-light leading-relaxed">{s.text}</p>
                </div>
              ))}
            </div>

            <div className="max-w-2xl mx-auto mt-20">
              <h2 className="font-serif text-2xl sm:text-3xl mb-8 text-center">The small print, in plain words</h2>
              <dl className="divide-y divide-lavender-soft/40">
                {faqs.map((f) => (
                  <div key={f.q} className="py-5">
                    <dt className="text-sm font-medium text-charcoal mb-1.5">{f.q}</dt>
                    <dd className="text-sm text-charcoal-light leading-relaxed">{f.a}</dd>
                  </div>
                ))}
              </dl>
              <p className="text-xs text-charcoal-light mt-8 text-center">
                Already have a link from an order or a fitting? It&apos;s in that email, and the same one works for
                both doors.{" "}
                <Link href="/atelier" className="underline underline-offset-2 hover:text-charcoal">
                  About the atelier
                </Link>
              </p>
            </div>
          </div>
        </section>
      </main>
      <FooterWrapper />
    </>
  );
}

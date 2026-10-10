"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, CalendarClock, Sparkles, Car, MessageCircle } from "lucide-react";
import TermsNote from "@/components/TermsNote";
import TiedOff from "@/components/stitch/TiedOff";
import { trackLead, trackReferralApply } from "@/lib/analytics";
import { clearReferralCookie, pounds, readReferralCookie } from "@/lib/friendsLink";
import { ATELIER_SERVICES, slotsFor, startForService, startsFor } from "@/lib/atelierServices";
import { durationLabel, pinnedLabel, slotIsOffered } from "@/lib/slots";
import {
  FIELD_LIMITS,
  HONEYPOT_FIELD,
  NO_ANSWER,
  bookingBody,
  newRequestKey,
  sendBooking,
  whatsappAboutBooking,
} from "@/lib/bookingForm";
import { WHEN_MAX, onItsWayTo, postcodeDistrict, type CollectionOffer } from "@/lib/collection";

/**
 * Google Ads conversion for a fitting request. Create a "Lead" conversion in
 * Google Ads and paste its label here (looks like "AW-18152477897/AbCdEfGh").
 * Until then GA4 and Meta still get the event; only the Ads conversion waits.
 */
const ADS_LEAD_CONVERSION: string | undefined = undefined;

const SERVICES = ATELIER_SERVICES;

/** What Book with no time chosen says — in chalk on screen, in words to a screen reader */
const CHOOSE_A_TIME = "Please choose a time.";

/** The focus ring is the darker lavender: the pale one at 20% was barely there
 *  on white, and someone moving through the form by keyboard lost their place */
const FIELD_CLASS =
  "w-full px-4 py-3 rounded-xl border border-lavender-soft/40 bg-white text-sm focus:outline-none focus:border-lavender-ink focus:ring-2 focus:ring-lavender-ink/25";

interface Slot {
  start: string;
  label: string;
}

interface SlotDay {
  date: string;
  label: string;
  slots: Slot[];
}

/**
 * What a customer whose booking got no answer sees in place of the browser's
 * "Load failed": what probably happened, that trying again is safe, and
 * Kristina's WhatsApp one tap away with the booking already described.
 */
export function NoAnswer({ whatsapp }: { whatsapp: string }) {
  return (
    <div
      role="alert"
      className="sm:col-span-2 rounded-xl border border-lavender-soft/40 bg-lavender-bg/70 px-4 py-3 text-sm text-charcoal"
    >
      <p>{NO_ANSWER}</p>
      <a
        href={whatsapp}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-charcoal/20 bg-white text-xs tracking-wider uppercase font-medium hover:border-lavender transition-colors"
      >
        <MessageCircle size={14} aria-hidden="true" />
        WhatsApp Kristina
      </a>
    </div>
  );
}

/**
 * Booking a fitting.
 *
 * When Kristina has filled in her opening hours the form offers real times and
 * confirms one on the spot; until then it asks for a preferred date and she
 * replies by hand, exactly as before. That fallback is the point — the shop
 * must never end up with a booking form that offers nothing.
 *
 * `defaultService` lets a landing page name the job it is about — a request
 * from the wedding page arrives in the Studio as "Wedding Dress Alterations"
 * rather than a generic "Alterations", so Kristina can see which page is
 * actually bringing work in without opening analytics.
 *
 * A bridal fitting holds two slots in a row (see slotsFor), so with one
 * chosen the picker offers only starts where both are free, and a start that
 * no longer fits once the service changes is let go. If no such start is free
 * at all, the form asks for a preferred date instead, as it does with no diary.
 *
 * `collection` is the Collect & return offer as the Studio has it (see
 * @/lib/collection), handed down by the page; without it the form is exactly
 * what it was. Chosen, it replaces the diary with a postcode and "when are you
 * usually in": Kristina picks the time from her diary afterwards, and the price shows as the postcode is
 * typed, so nobody has to ask what it costs.
 */
export default function AtelierBookingForm({
  defaultService,
  collection = null,
}: {
  defaultService?: string;
  collection?: CollectionOffer | null;
} = {}) {
  const options =
    defaultService && !SERVICES.includes(defaultService)
      ? [defaultService, ...SERVICES]
      : SERVICES;
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [service, setService] = useState(defaultService ?? SERVICES[0]);
  const [preferredDate, setPreferredDate] = useState("");
  const [notes, setNotes] = useState("");
  // Only a bot fills this in — see HONEYPOT_FIELD
  const [trap, setTrap] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  // No answer came back at all: said in plain words, with WhatsApp beside it
  const [unanswered, setUnanswered] = useState(false);
  // This form's own key, made on the first send and sent with every retry —
  // see REQUEST_KEY_FIELD
  const requestKey = useRef<string | null>(null);
  // The terms line under the button, which the button names as its description
  const termsId = useId();

  // Collect & return
  const [mode, setMode] = useState<"fitting" | "collect">("fitting");
  const [postcode, setPostcode] = useState("");
  const [collectWhen, setCollectWhen] = useState("");
  const [collected, setCollected] = useState<{ terms: string; when: string | null } | null>(null);
  const collecting = mode === "collect" && !!collection;
  const district = postcodeDistrict(postcode);
  const zone = district ? collection?.zones.find((z) => z.districts.includes(district)) ?? null : null;
  // "SO1" is a district of its own, but here it is usually SO17 half typed
  const typing = !zone && onItsWayTo(collection?.zones.flatMap((z) => z.districts) ?? [], postcode);
  const refused = district && !zone && !typing ? district : null;

  // A friend's link left its code on this device; the discount is noted on the
  // booking and taken off when they pay
  const [friend, setFriend] = useState<{ code: string; firstName: string | null; discount: number } | null>(null);
  const [referralResult, setReferralResult] = useState<
    { applied: true; discount: number; referredBy?: string } | { applied: false; reason?: string | null } | null
  >(null);

  useEffect(() => {
    const code = readReferralCookie();
    if (!code) return;
    let cancelled = false;
    fetch(`/api/referrals?code=${encodeURIComponent(code)}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data?.valid) {
          setFriend({ code: data.code, firstName: data.firstName ?? null, discount: data.atelierDiscount ?? 0 });
        } else {
          clearReferralCookie();
        }
      })
      .catch(() => {/* no discount is the safe default */});
    return () => {
      cancelled = true;
    };
  }, []);

  // The diary
  const [days, setDays] = useState<SlotDay[] | null>(null);
  const [slotMinutes, setSlotMinutes] = useState(30);
  const [activeDate, setActiveDate] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [confirmedFor, setConfirmedFor] = useState<string | null>(null);
  // Book pressed with no time chosen: a stroke of chalk under "Choose a time",
  // one more for each press, brushed off when a time is picked (.chalk in globals.css)
  const [chalk, setChalk] = useState(0);
  const timesRef = useRef<HTMLFieldSetElement>(null);

  const loadSlots = useCallback(async () => {
    try {
      const res = await fetch("/api/atelier/slots", { cache: "no-store" });
      const data = await res.json();
      const available: SlotDay[] = data?.bookable ? data.days ?? [] : [];
      if (typeof data?.slotMinutes === "number" && data.slotMinutes > 0) setSlotMinutes(data.slotMinutes);
      setDays(available);
      setActiveDate((current) =>
        current && available.some((d) => d.date === current) ? current : available[0]?.date ?? null
      );
      setPicked((current) => (current && slotIsOffered(available, current) ? current : null));
    } catch {
      // No diary is the same as no diary configured: ask for a date instead
      setDays([]);
    }
  }, []);

  useEffect(() => {
    loadSlots();
  }, [loadSlots]);

  // The starts this service can take: a bride's need the next slot free too
  const offered = useMemo(() => (days ? startsFor(days, service, slotMinutes) : null), [days, service, slotMinutes]);
  const bookable = !!offered && offered.length > 0;
  const day = offered?.find((d) => d.date === activeDate) ?? offered?.[0] ?? null;
  const slot = days ? startForService(days, service, slotMinutes, picked) : null;
  const visitMinutes = slotsFor(service) * slotMinutes;
  const twoSlots = slotsFor(service) > 1;

  /**
   * The times, brought into view if the press was a screen away from them —
   * their heading and its chalk lined up just under the fixed header, never
   * behind it, however tall the day is — and the first of them focused, so
   * the next tap or key is a choice
   */
  function showTimes() {
    const times = timesRef.current;
    if (!times) return;
    const header = Math.max(0, document.querySelector("header")?.getBoundingClientRect().bottom ?? 0);
    const top = times.getBoundingClientRect().top;
    if (top < header + 8 || top > window.innerHeight - 160) {
      const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.scrollTo({ top: window.scrollY + top - header - 16, behavior: still ? "auto" : "smooth" });
    }
    times.querySelector<HTMLButtonElement>(".pin-slot")?.focus({ preventScroll: true });
  }

  function chooseService(next: string) {
    setService(next);
    setUnanswered(false);
    // Another service offers other times, or none: the chalk and its words start over
    setChalk(0);
    setError((current) => (current === CHOOSE_A_TIME ? null : current));
    // A start that fitted one slot may not fit two: let it go rather than send it
    if (days) setPicked((current) => startForService(days, next, slotMinutes, current));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Whatever is said next replaces "we couldn't hear back" — a time to
    // choose included, which that block used to hide
    setUnanswered(false);
    if (collecting) {
      // The server decides again; this only saves a round trip for the obvious
      if (!zone) {
        setError(refused ? `Sorry, we don't collect from ${refused} yet.` : "Please enter your postcode, like SO17 1AB.");
        setStatus("error");
        return;
      }
    } else if (bookable && !slot) {
      // Said in chalk by the times, not in red by the button; a screen reader
      // still hears it, from the message kept out of sight below
      setError(CHOOSE_A_TIME);
      setStatus("error");
      setChalk((n) => n + 1);
      showTimes();
      return;
    }

    // Whatever comes back from here on is the server's, and is shown in words
    setChalk(0);
    setStatus("loading");
    setError(null);
    requestKey.current ??= newRequestKey();
    try {
      const reply = await sendBooking(
        bookingBody({
          name,
          email,
          phone,
          service,
          notes,
          trap,
          requestKey: requestKey.current,
          collection: collecting ? { postcode, when: collectWhen } : null,
          slot,
          preferredDate,
          referralCode: friend?.code ?? null,
        })
      );

      // The connection dropped, or what came back was not the booking's answer.
      // Trying again goes with the same key, so a first copy that did arrive
      // is answered as itself rather than booked twice.
      if (!reply.reached) {
        setUnanswered(true);
        setStatus("error");
        return;
      }
      const data = reply.data as {
        error?: string;
        slotTaken?: boolean;
        confirmedFor?: string;
        collection?: { terms: string; when: string | null };
        referral?: { applied: true; discount: number; referredBy?: string } | { applied: false; reason?: string | null };
      };

      if (!reply.ok) {
        if (data.slotTaken) {
          // Somebody got there first — show the diary as it is now
          setPicked(null);
          await loadSlots();
        }
        throw new Error(data.error || "Failed to send request");
      }

      setConfirmedFor(data.confirmedFor ?? null);
      setCollected(data.collection ?? null);
      setReferralResult(data.referral ?? null);
      if (data.referral?.applied) trackReferralApply("atelier");
      setStatus("done");
      trackLead({ service, adsConversionLabel: ADS_LEAD_CONVERSION });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setStatus("error");
    }
  }

  if (status === "done") {
    return (
      <div className="flex flex-col items-center text-center py-8" role="status">
        {/* A booking that holds its time is tied off under its heading; a
            request Kristina still answers is only tacked (stitch/TiedOff.tsx) */}
        {collected ? (
          <>
            <p className="font-serif text-xl mb-5">
              <TiedOff tacked>Collection requested</TiedOff>
            </p>
            <p className="text-sm text-charcoal-light max-w-sm">
              Kristina will email you the time she&apos;ll come and ask for your address. Nothing is collected until
              you&apos;ve agreed it together.
              {collected.when ? <> You told us: &ldquo;{collected.when}&rdquo;.</> : null}
            </p>
            <p className="text-sm text-charcoal mt-3 font-medium">Collection &amp; return: {collected.terms}</p>
          </>
        ) : confirmedFor ? (
          <>
            <p className="font-serif text-xl mb-5">
              <TiedOff>You&apos;re booked in</TiedOff>
            </p>
            <p className="text-sm text-charcoal mb-1 font-medium">{confirmedFor}</p>
            {twoSlots && (
              <p className="text-sm text-charcoal mb-1">Your fitting takes {durationLabel(visitMinutes)}.</p>
            )}
            <p className="text-sm text-charcoal-light max-w-sm">
              A confirmation is on its way to your inbox. Reply to it if you need to move the time.
            </p>
          </>
        ) : (
          <>
            <p className="font-serif text-xl mb-5">
              <TiedOff tacked>Request sent!</TiedOff>
            </p>
            <p className="text-sm text-charcoal-light max-w-sm">
              We&apos;ll confirm your appointment by email or WhatsApp shortly.
            </p>
          </>
        )}
        {referralResult?.applied && (
          <p className="text-sm text-charcoal mt-4 inline-flex items-center gap-2">
            <Sparkles size={14} className="text-lavender" aria-hidden="true" />
            {pounds(referralResult.discount)} off{referralResult.referredBy ? ` from ${referralResult.referredBy}` : ""} is
            noted — it comes off when you pay.
          </p>
        )}
        {referralResult && !referralResult.applied && referralResult.reason && (
          <p className="text-xs text-charcoal-light mt-4 max-w-sm">{referralResult.reason}</p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4 min-w-0">
      {/* Only a bot fills this in: hidden from people, from screen readers and from the keyboard */}
      <input
        type="text"
        name={HONEYPOT_FIELD}
        tabIndex={-1}
        autoComplete="off"
        value={trap}
        onChange={(e) => setTrap(e.target.value)}
        aria-hidden="true"
        className="hidden"
      />
      {/* ── Fitting, or Collect & return ── */}
      {collection && (
        <fieldset className="sm:col-span-2 min-w-0 border-0 p-0 m-0">
          <legend className="text-xs tracking-wider uppercase text-charcoal-light mb-3">How should it reach Kristina?</legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {(
              [
                { value: "fitting", title: "Bring it to a fitting", line: "Pinned on you, in the atelier" },
                { value: "collect", title: "Collect & return", line: collection.headline },
              ] as const
            ).map((option) => {
              const active = mode === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    setMode(option.value);
                    setError(null);
                    setUnanswered(false);
                    setChalk(0);
                    if (status === "error") setStatus("idle");
                  }}
                  aria-pressed={active}
                  className={`text-left px-4 py-3 rounded-xl border transition-colors ${
                    active
                      ? "bg-lavender border-lavender text-charcoal shadow-sm"
                      : "bg-white border-lavender-soft/50 text-charcoal hover:border-lavender hover:bg-lavender/10"
                  }`}
                >
                  <span className="block text-sm font-medium">{option.title}</span>
                  <span className="block text-xs text-charcoal-light mt-0.5">{option.line}</span>
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      {collecting && collection && (
        <fieldset className="sm:col-span-2 min-w-0 border-0 p-0 m-0 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <legend className="sr-only">Collection</legend>
          <div>
            <label htmlFor="booking-postcode" className="block text-xs tracking-wider uppercase text-charcoal-light mb-1.5">
              Your postcode
            </label>
            <input
              id="booking-postcode"
              name="postcode"
              autoComplete="postal-code"
              required
              maxLength={FIELD_LIMITS.postcode}
              // A postcode is capitals and no dictionary word: the phone's
              // keyboard shouldn't lower-case it or "correct" SO17 into a word
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="next"
              value={postcode}
              onChange={(e) => {
                setPostcode(e.target.value);
                setError(null);
                if (status === "error") setStatus("idle");
              }}
              placeholder="SO17 1AB"
              className={FIELD_CLASS}
            />
          </div>
          <div>
            <label htmlFor="booking-when" className="block text-xs tracking-wider uppercase text-charcoal-light mb-1.5">
              When are you usually in? <span className="normal-case tracking-normal">(optional)</span>
            </label>
            <input
              id="booking-when"
              name="collectionWhen"
              maxLength={WHEN_MAX}
              value={collectWhen}
              onChange={(e) => setCollectWhen(e.target.value)}
              placeholder="e.g. weekday afternoons"
              className={FIELD_CLASS}
            />
          </div>
          <p className="sm:col-span-2 flex items-start gap-2 text-sm text-charcoal" aria-live="polite">
            <Car size={16} className="text-lavender shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              {zone ? (
                <>
                  <strong>{zone.name}:</strong> {zone.terms}. Kristina will email you the time she&apos;ll come and
                  ask for your address.
                </>
              ) : refused ? (
                <>
                  Sorry, we don&apos;t collect from {refused} yet. You&apos;re welcome to{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setMode("fitting");
                      setError(null);
                      setUnanswered(false);
                      setChalk(0);
                      if (status === "error") setStatus("idle");
                    }}
                    className="underline underline-offset-2"
                  >
                    book a fitting
                  </button>{" "}
                  instead.
                </>
              ) : (
                <>Type your postcode to see the price.</>
              )}
            </span>
          </p>
          <p className="sm:col-span-2 text-[11px] text-charcoal-light -mt-2">{collection.note}</p>
        </fieldset>
      )}

      {/* ── Pick a time ──
          min-w-0 matters more than it looks: a grid item will not shrink below
          its own content, so without it the strip of days stretches the whole
          form instead of scrolling inside it, and takes the page sideways. */}
      {bookable && !collecting && (
        <fieldset ref={timesRef} className="sm:col-span-2 min-w-0 border-0 p-0 m-0">
          <legend className="relative w-full flex items-center gap-2 text-xs tracking-wider uppercase text-charcoal-light mb-3">
            <CalendarClock size={14} aria-hidden="true" />
            Choose a time
            {/* Book pressed with no time: a stroke of tailor's chalk under
                these words and a note at its end. Another press draws it
                again; a time picked brushes it off. */}
            <AnimatePresence>
              {chalk > 0 && (
                <motion.span
                  key={chalk}
                  className="chalk"
                  aria-hidden="true"
                  exit={{ opacity: 0, filter: "blur(1px)" }}
                  transition={{ duration: 0.25 }}
                >
                  <span className="chalk-mark" />
                  <span className="chalk-note font-serif italic normal-case tracking-normal text-sm text-lavender-ink">
                    choose one<span className="chalk-note-tail"> first</span>
                  </span>
                </motion.span>
              )}
            </AnimatePresence>
          </legend>

          {twoSlots && (
            <p className="text-xs text-charcoal-light mb-3">
              A bridal fitting takes {durationLabel(visitMinutes)}, so these are the times with all of it free.
            </p>
          )}

          {/* The days run off the right edge on a phone, and a hard cut
              looked like the end of the list: the last 2.5rem fades out, and
              the same 2.5rem of padding at the end means a list that fits, or
              one scrolled to its end, never has a day under the fade */}
          <div className="flex gap-2 overflow-x-auto overscroll-x-contain pb-2 -mx-1 pl-1 pr-10 [mask-image:linear-gradient(to_right,#000_calc(100%_-_2.5rem),transparent)]">
            {offered!.map((d) => {
              const active = d.date === day?.date;
              return (
                <button
                  key={d.date}
                  type="button"
                  onClick={() => setActiveDate(d.date)}
                  aria-pressed={active}
                  // 44px tall, a finger's width: at text-xs and py-2 the days
                  // were 32px and easy to miss beside each other
                  className={`shrink-0 min-h-11 px-4 py-2 rounded-full border text-sm font-medium transition-colors ${
                    active
                      ? "bg-lavender border-lavender text-charcoal"
                      : "bg-white border-lavender-soft/50 text-charcoal-light hover:border-lavender"
                  }`}
                >
                  {d.label}
                </button>
              );
            })}
          </div>

          {day && (
            <div className="flex flex-wrap gap-2 mt-3">
              {day.slots.map((s) => {
                const active = s.start === slot;
                return (
                  <button
                    key={s.start}
                    type="button"
                    onClick={() => {
                      setPicked(s.start);
                      setError(null);
                      setUnanswered(false);
                      setChalk(0);
                      if (status === "error") setStatus("idle");
                    }}
                    aria-pressed={active}
                    // The chosen time gets a dressmaker's pin through its
                    // corner: this one is yours (.pin-slot in globals.css)
                    className={`pin-slot relative px-4 py-2.5 rounded-xl border text-sm font-medium tabular-nums transition-colors ${
                      active
                        ? "bg-lavender border-lavender text-charcoal shadow-sm"
                        : "bg-white border-lavender-soft/50 text-charcoal hover:border-lavender hover:bg-lavender/10"
                    }`}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          )}

          <p className="text-[11px] text-charcoal-light mt-3">
            Times are Southampton time, and yours is held the moment you book. Nothing suits?{" "}
            <a
              href="https://wa.me/447729741116"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-charcoal"
            >
              Ask on WhatsApp
            </a>
            .
          </p>
        </fieldset>
      )}

      <div className="sm:col-span-1">
        <label htmlFor="booking-name" className="block text-xs tracking-wider uppercase text-charcoal-light mb-1.5">Name</label>
        <input
          id="booking-name"
          name="name"
          autoComplete="name"
          required
          maxLength={FIELD_LIMITS.name}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={FIELD_CLASS}
        />
      </div>
      <div className="sm:col-span-1">
        <label htmlFor="booking-email" className="block text-xs tracking-wider uppercase text-charcoal-light mb-1.5">Email</label>
        <input
          id="booking-email"
          name="email"
          autoComplete="email"
          type="email"
          required
          maxLength={FIELD_LIMITS.email}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={FIELD_CLASS}
        />
      </div>
      <div className="sm:col-span-1">
        <label htmlFor="booking-phone" className="block text-xs tracking-wider uppercase text-charcoal-light mb-1.5">
          Phone <span className="normal-case text-charcoal-light">(optional)</span>
        </label>
        <input
          id="booking-phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          maxLength={FIELD_LIMITS.phone}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className={FIELD_CLASS}
        />
      </div>
      <div className="sm:col-span-1">
        <label htmlFor="booking-service" className="block text-xs tracking-wider uppercase text-charcoal-light mb-1.5">Service</label>
        <select
          id="booking-service"
          name="service"
          value={service}
          onChange={(e) => chooseService(e.target.value)}
          className={FIELD_CLASS}
        >
          {options.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {/* Only worth asking when there is no diary to pick from, and nothing to collect */}
      {!bookable && !collecting && (
        <div className="sm:col-span-1">
          <label htmlFor="booking-date" className="block text-xs tracking-wider uppercase text-charcoal-light mb-1.5">
            Preferred Date <span className="normal-case text-charcoal-light">(optional)</span>
          </label>
          <input
            id="booking-date"
            name="preferredDate"
            type="date"
            value={preferredDate}
            onChange={(e) => setPreferredDate(e.target.value)}
            className={FIELD_CLASS}
          />
        </div>
      )}

      <div className="sm:col-span-2">
        <label htmlFor="booking-notes" className="block text-xs tracking-wider uppercase text-charcoal-light mb-1.5">
          Notes <span className="normal-case text-charcoal-light">(optional)</span>
        </label>
        <textarea
          id="booking-notes"
          name="notes"
          rows={3}
          maxLength={FIELD_LIMITS.notes}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Tell us about the garment and what you need done..."
          className={`${FIELD_CLASS} resize-none`}
        />
      </div>

      {friend && friend.discount > 0 && (
        <p className="sm:col-span-2 flex items-start gap-2 text-sm text-charcoal bg-lavender-bg/70 border border-lavender-soft/40 rounded-xl px-4 py-3">
          <Sparkles size={16} className="text-lavender shrink-0 mt-0.5" aria-hidden="true" />
          <span>
            <strong>{pounds(friend.discount)} off your first alteration</strong>
            {friend.firstName ? `, from ${friend.firstName}` : ""}. It comes off when you pay — first visits only, so
            we check by email.
          </span>
        </p>
      )}

      <div className="sm:col-span-2 flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={status === "loading"}
          aria-describedby={termsId}
          className="press inline-flex items-center justify-center gap-2 px-6 sm:px-8 py-3.5 bg-lavender text-charcoal rounded-full text-sm tracking-wider uppercase font-medium text-center hover:bg-lavender-hover disabled:opacity-60"
        >
          {status === "loading" && <Loader2 size={16} className="animate-spin" />}
          {/* With a time pinned the button names it: on a phone the times
              are a full screen above, and this keeps her choice in sight */}
          {status === "loading"
            ? "Sending..."
            : collecting
            ? "Request Collection"
            : bookable
            ? slot
              ? `Book ${pinnedLabel(slot)}`
              : "Book This Time"
            : "Request Booking"}
        </button>
        <AnimatePresence>
          {error && !unanswered && (
            <motion.p
              role="alert"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              // Only "choose a time" is said by the chalk, while it is there; this
              // line keeps it for screen readers. Anything else shows in words.
              className={chalk > 0 && bookable && !collecting && error === CHOOSE_A_TIME ? "sr-only" : "text-xs text-rose-700"}
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {/* What pressing the button agrees to, said before it is pressed: a
          booking hands Kristina a name, an email, a phone number and, for a
          collection, a home address */}
      <TermsNote id={termsId} doing="booking" privacy className="sm:col-span-2 -mt-1" />

      {unanswered && <NoAnswer whatsapp={whatsappAboutBooking({ name, service, slot, collecting })} />}
    </form>
  );
}

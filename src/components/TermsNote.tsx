import Link from "next/link";

/**
 * Where the shop's terms and privacy notice live: Studio pages (legalPage) at
 * /pages/<slug>. The Studio document's address has to be exactly "terms" —
 * its Generate button would make "terms-and-conditions" from the title, and
 * every line below would then lead to a "page not found".
 */
export const TERMS_HREF = "/pages/terms";
export const PRIVACY_HREF = "/pages/privacy-policy";

/** Underlined, so a link is found by its shape and not only by its colour */
const LINK_CLASS = "underline underline-offset-2 hover:text-charcoal transition-colors";

/**
 * The one small line under a button that books or pays, saying what the
 * customer agrees to by pressing it, with the pages one tap away.
 *
 * The full grey, not a faded one: text-charcoal-light clears the 4.5:1 small
 * text needs on white, cream and the lavender wash the forms sit on, where
 * /70 fell to under 3:1. `id` is for the button's aria-describedby, so a
 * screen reader says the line with the button rather than after it.
 */
export default function TermsNote({
  doing,
  privacy = false,
  id,
  className = "",
}: {
  doing: "booking" | "paying";
  /**
   * Point to the privacy policy too: a booking hands us a name, a phone number
   * and sometimes a postcode. Pointed to, not agreed to — a privacy notice only
   * informs, and these details are used under the contract, not consent.
   */
  privacy?: boolean;
  id?: string;
  className?: string;
}) {
  return (
    <p id={id} className={`text-xs text-charcoal-light leading-relaxed ${className}`.trim()}>
      By {doing} you agree to our{" "}
      <Link href={TERMS_HREF} className={LINK_CLASS}>
        Terms &amp; Conditions
      </Link>
      .
      {privacy && (
        <>
          {" "}Our{" "}
          <Link href={PRIVACY_HREF} className={LINK_CLASS}>
            Privacy Policy
          </Link>{" "}
          explains how we use your details.
        </>
      )}
    </p>
  );
}

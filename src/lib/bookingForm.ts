/**
 * What the booking form and the booking route agree on. Kept apart from
 * @/lib/bookingRequest, which reads every landing page to know their service
 * names: the form runs in the customer's browser, and these few lines are all
 * it needs.
 */

/** The longest each field may be — roomy for a person, nothing a script can fill the Studio with. */
export const FIELD_LIMITS = {
  name: 80,
  // The longest an email address can be at all
  email: 254,
  phone: 30,
  notes: 2000,
  // A date from the picker is ten characters; this is room for a typed one
  preferredDate: 40,
  // "SO17 1AB" with room for stray spaces
  postcode: 16,
} as const;

/**
 * The field only a bot fills in. Hidden from people and from screen readers,
 * skipped by the keyboard. Not called "company", as the newsletter's is: on a
 * form with a name, an email and a phone, a browser offers its saved address
 * card, and a company filled in from that would turn a real customer's
 * booking into silence.
 */
export const HONEYPOT_FIELD = "website";

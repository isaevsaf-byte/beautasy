/**
 * Which document is "the" Site Settings.
 *
 * The Studio has opened Site Settings as the fixed id "siteSettings" since
 * 27 August 2026, but the only settings document in the dataset was an older
 * one with a random id, and every reader on the site took whichever
 * `siteSettings` came first — the old one. So everything Kristina saved in
 * the Studio (the review link, the Friends amounts, posting hours) reached
 * nobody, and nothing said so. Found on 17 September 2026; the old
 * document's live values were copied into "siteSettings" that day.
 *
 * Every reader now names the document the Studio edits. The fallback exists
 * only so that the site keeps its shipping prices if that document were ever
 * missing; it is never the one being edited.
 *
 * No imports here, so the Studio structure can use the id without pulling a
 * Sanity client into its bundle.
 */
export const SITE_SETTINGS_ID = "siteSettings";

/** A GROQ expression for the Site Settings document. Wrap in parentheses before projecting. */
export const SITE_SETTINGS = `coalesce(
  *[_id == "${SITE_SETTINGS_ID}"][0],
  *[_type == "siteSettings" && !(_id in path("drafts.**"))] | order(_updatedAt desc)[0]
)`;

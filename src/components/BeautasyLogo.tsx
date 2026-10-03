/* eslint-disable @next/next/no-img-element */

// The 64px mark (2 KB), the same picture as the favicon. It is only ever drawn
// at 18px; the full beautasy-icon.png is 138 KB.
const LOGO_SRC = "/beautasy-mark.png";

interface BeautasyLogoProps {
  /** Size in pixels (used for both width and height) */
  size?: number;
  className?: string;
}

/**
 * Beautasy logo used for WhatsApp/Telegram links and brand consistency.
 * Sharp up to 32px; anything bigger needs a larger file.
 */
export default function BeautasyLogo({
  size = 24,
  className = "",
}: BeautasyLogoProps) {
  return (
    <img
      src={LOGO_SRC}
      alt="Beautasy"
      width={size}
      height={size}
      className={className}
    />
  );
}

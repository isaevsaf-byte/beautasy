/* eslint-disable @next/next/no-img-element */

const LOGO_SRC = "/beautasy-icon.png";

interface BeautasyLogoProps {
  /** Size in pixels (used for both width and height) */
  size?: number;
  className?: string;
}

/**
 * Beautasy logo used for WhatsApp/Telegram links and brand consistency.
 * Add your logo as public/beautasy-logo.png (square, min 96×96 for quality).
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

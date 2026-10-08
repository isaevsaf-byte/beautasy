import { MessageCircle } from "lucide-react";

/**
 * One line beside the booking button for the person who is not ready to pick
 * a time until they know what it will cost: a photo on WhatsApp gets them a
 * price from Kristina first. It says nothing about what the fitting costs or
 * how to pay — that is Kristina's to decide and to say.
 *
 * It asks for one more photo, of the label inside: a dressmaker turns a piece
 * inside out and reads the label before anything else, and with "98% cotton,
 * 2% elastane" in front of her Kristina names the price the first time,
 * without asking what the fabric is. One photo is still enough — the label is
 * asked for, not required — and the photos go to her WhatsApp only.
 */
export default function PriceFirst({ whatsapp, className = "" }: { whatsapp: string; className?: string }) {
  return (
    <p className={`flex items-start gap-2 text-sm text-charcoal-light ${className}`}>
      <MessageCircle size={15} aria-hidden="true" className="shrink-0 mt-0.5 text-lavender-ink" />
      <span>
        Want a price first?{" "}
        <a
          href={whatsapp}
          target="_blank"
          rel="noopener noreferrer"
          className="text-charcoal underline underline-offset-4 decoration-charcoal/30 hover:decoration-charcoal transition-colors"
        >
          Send Kristina a photo on WhatsApp
        </a>{" "}
        — and one of the label inside.
      </span>
    </p>
  );
}

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Beautasy Atelier — Alterations & Tailoring in Southampton",
  description:
    "Professional clothing repairs and tailoring in Southampton. Expert alterations, custom sewing, and repairs — book a fitting today.",
  openGraph: {
    title: "Beautasy Atelier — Alterations & Tailoring in Southampton",
    description:
      "Professional clothing repairs and tailoring in Southampton. Book a fitting.",
    images: [
      {
        url: "/beautasy-icon.png",
        width: 1200,
        height: 630,
        alt: "Beautasy Atelier",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Beautasy Atelier — Alterations & Tailoring",
    description:
      "Professional clothing repairs and tailoring in Southampton. Book a fitting.",
    images: ["/beautasy-icon.png"],
  },
};

export default function AtelierLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

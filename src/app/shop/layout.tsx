import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Beautasy Shop — Handmade Lingerie & Accessories",
  description:
    "Handmade silk lingerie, accessories, kids' clothing, and home decor. Every piece crafted with love in Southampton.",
  openGraph: {
    title: "Beautasy Shop — Handmade Lingerie & Accessories",
    description:
      "Handmade silk lingerie and accessories crafted in Southampton.",
    images: [
      {
        url: "/beautasy-icon.png",
        width: 1200,
        height: 630,
        alt: "Beautasy Shop",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Beautasy Shop — Handmade Lingerie & Accessories",
    description:
      "Handmade silk lingerie and accessories crafted in Southampton.",
    images: ["/beautasy-icon.png"],
  },
};

export default function ShopLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

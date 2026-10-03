import type { Metadata } from "next";
import { SignIn } from "@clerk/nextjs";
import Header from "@/components/HeaderWrapper";
import Footer from "@/components/Footer";

/**
 * Not a page for search. robots.txt already keeps crawlers out of /sign-in,
 * and a crawler that obeys it never fetches this page, so it never reads the
 * tag below — it is for anything that fetches the page anyway, and it costs
 * nothing. The title is its own, where it used to inherit the home page's.
 */
export const metadata: Metadata = {
  title: "Sign in | Beautasy",
  robots: { index: false, follow: true },
};

export default function SignInPage() {
  return (
    <>
      <Header />
      <main className="pt-28 min-h-screen flex items-center justify-center bg-cream">
        <SignIn
          appearance={{
            variables: { colorPrimary: "#DCD0FF" },
          }}
        />
      </main>
      <Footer />
    </>
  );
}

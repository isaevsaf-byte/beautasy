import type { Metadata } from "next";
import { SignUp } from "@clerk/nextjs";
import Header from "@/components/HeaderWrapper";
import Footer from "@/components/Footer";

/**
 * Not a page for search. robots.txt already keeps crawlers out of /sign-up,
 * and a crawler that obeys it never fetches this page, so it never reads the
 * tag below — it is for anything that fetches the page anyway, and it costs
 * nothing. The title is its own, where it used to inherit the home page's.
 */
export const metadata: Metadata = {
  title: "Create an account | Beautasy",
  robots: { index: false, follow: true },
};

export default function SignUpPage() {
  return (
    <>
      <Header />
      {/* svh: the screen with Safari's bars showing, so the form is not
          centred partly under them. Clerk draws its fields at about 13px,
          and a phone zooms the page in on any field under 16px. */}
      <main className="pt-28 min-h-svh flex items-center justify-center bg-cream">
        <SignUp
          appearance={{
            variables: { colorPrimary: "#DCD0FF" },
            elements: {
              formFieldInput: { fontSize: "16px" },
              otpCodeFieldInput: { fontSize: "16px" },
            },
          }}
        />
      </main>
      <Footer />
    </>
  );
}

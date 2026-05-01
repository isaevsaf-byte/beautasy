import { SignIn } from "@clerk/nextjs";
import Header from "@/components/HeaderWrapper";
import Footer from "@/components/Footer";

export default function SignInPage() {
  return (
    <>
      <Header />
      <main className="pt-24 min-h-screen flex items-center justify-center bg-cream">
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

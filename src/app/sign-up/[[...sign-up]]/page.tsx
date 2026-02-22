import { SignUp } from "@clerk/nextjs";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export default function SignUpPage() {
  return (
    <>
      <Header />
      <main className="pt-24 min-h-screen flex items-center justify-center bg-cream">
        <SignUp
          appearance={{
            variables: { colorPrimary: "#DCD0FF" },
          }}
        />
      </main>
      <Footer />
    </>
  );
}

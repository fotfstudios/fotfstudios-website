import Link from "next/link";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import { CLOSURE } from "@/lib/site";

/**
 * Shared chrome for the SEO guide pages (route group — does not affect URLs).
 * Same prose-page idiom as /terminos: Nav + narrow main + Footer.
 */
export default function GuiasLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Nav />
      <main
        className={`mx-auto max-w-3xl px-6 pb-20 md:pb-28 ${
          CLOSURE.active ? "pt-40 md:pt-36" : "pt-20 md:pt-28"
        }`}
      >
        <Link href="/" className="label-sm text-bone-mute transition-colors hover:text-gold">
          ← FOTF Studios
        </Link>
        {children}
      </main>
      <Footer />
    </>
  );
}

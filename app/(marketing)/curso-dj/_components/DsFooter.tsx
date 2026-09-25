import Link from "next/link";
import Logo from "@/components/Logo";

const LINKS = [
  { href: "/", label: "Sala de ensayo" },
  { href: "/blog", label: "Blog" },
  { href: "/guia-dj", label: "Guía DJ" },
  { href: "/privacidad", label: "Privacidad" },
  { href: "/terminos", label: "Términos" },
] as const;

export default function DsFooter() {
  return (
    <footer className="border-t border-[var(--border-subtle)]">
      <div className="mx-auto flex max-w-[1120px] flex-col gap-8 px-5 pt-10 pb-28 md:pb-12">
        <div className="flex flex-wrap items-center justify-between gap-6">
          <Logo variant="lockup" color="cream" height={96} />
          <p className="ds-eyebrow m-0 text-[var(--text-muted)]">Sala de ensayo DJ · Viña del Mar</p>
        </div>
        <nav aria-label="Pie de página">
          <ul className="m-0 flex list-none flex-wrap gap-x-6 gap-y-2 p-0 text-sm text-[var(--text-secondary)]">
            {LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="rounded-[var(--radius-sm)] transition-colors hover:text-[var(--text-primary)]">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}

"use client";

import { useEffect, useState } from "react";
import Logo from "./Logo";
import Magnetic from "./Magnetic";
import { whatsappLink } from "@/lib/site";

const LINKS = [
  { href: "#sala", label: "La sala" },
  { href: "#equipo", label: "Equipo" },
  { href: "#galeria", label: "Galería" },
  { href: "#como", label: "Cómo funciona" },
  { href: "#precio", label: "Precio" },
  { href: "#ubicacion", label: "Ubicación" },
];

export default function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-500 ${
        scrolled ? "bg-ink/85 backdrop-blur-md border-b hairline" : "bg-transparent border-b border-transparent"
      }`}
    >
      <nav className="mx-auto flex max-w-[1280px] items-center justify-between px-5 py-4 md:px-10">
        <a href="#top" aria-label="FOTF Studios — inicio" className="shrink-0">
          <Logo variant="mini" height={40} />
        </a>

        <div className="hidden items-center gap-8 lg:flex">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="label text-bone-dim transition-colors hover:text-gold"
            >
              {l.label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <Magnetic className="hidden sm:inline-flex">
            <a
              href={whatsappLink()}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-gold px-5 py-2.5 label text-ink"
            >
              Reservar
            </a>
          </Magnetic>
          <button
            type="button"
            aria-label="Menú"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="flex h-9 w-9 flex-col items-center justify-center gap-[5px] lg:hidden"
          >
            <span
              className={`block h-[2px] w-5 bg-bone transition-transform ${open ? "translate-y-[7px] rotate-45" : ""}`}
            />
            <span className={`block h-[2px] w-5 bg-bone transition-opacity ${open ? "opacity-0" : ""}`} />
            <span
              className={`block h-[2px] w-5 bg-bone transition-transform ${open ? "-translate-y-[7px] -rotate-45" : ""}`}
            />
          </button>
        </div>
      </nav>

      {/* Menú móvil */}
      <div
        className={`overflow-hidden border-t hairline bg-ink/95 backdrop-blur-md transition-[max-height] duration-500 lg:hidden ${
          open ? "max-h-96" : "max-h-0 border-transparent"
        }`}
      >
        <div className="flex flex-col px-5 py-2">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="label border-b hairline py-4 text-bone-dim transition-colors hover:text-gold"
            >
              {l.label}
            </a>
          ))}
          <a
            href={whatsappLink()}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="mt-4 mb-2 bg-gold px-5 py-3 text-center label text-ink"
          >
            Reservar una hora
          </a>
        </div>
      </div>
    </header>
  );
}

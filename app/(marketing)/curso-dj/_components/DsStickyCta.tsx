"use client";

import { useEffect, useState } from "react";
import { formatCLP } from "@/lib/pricing";
import { PRECIOS } from "@/lib/curso-content";
import Button from "../_ds/Button";

/**
 * CTA fijo solo en móvil. Se esconde cuando #reserva entra en pantalla: ahí ya está
 * el formulario y la barra taparía el botón de enviar.
 */
export default function DsStickyCta() {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const target = document.getElementById("reserva");
    if (!target) return;
    const io = new IntersectionObserver(([e]) => setHidden(e.isIntersecting || e.boundingClientRect.top < 0), {
      threshold: 0,
    });
    io.observe(target);
    return () => io.disconnect();
  }, []);

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-30 border-t border-[var(--border-subtle)] bg-[rgba(10,10,10,0.8)] px-4 py-3 backdrop-blur-md transition-transform duration-200 md:hidden ${
        hidden ? "pointer-events-none translate-y-full" : ""
      }`}
      aria-hidden={hidden}
    >
      <Button size="lg" fullWidth href="#reserva" tabIndex={hidden ? -1 : undefined}>
        Reservar prueba · {formatCLP(PRECIOS.prueba)}
      </Button>
    </div>
  );
}

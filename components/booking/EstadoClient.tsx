"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SITE } from "@/lib/site";

export default function EstadoClient({ orderId }: { orderId: string }) {
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const r = await fetch(`/api/orders/${orderId}/status`);
        const d = await r.json();
        if (!active) return;
        setStatus(d?.status ?? "unknown");
        if (d?.status === "paid" || d?.status === "cancelled") clearInterval(id);
      } catch {
        if (active) setStatus("unknown");
      }
    };
    const id = setInterval(load, 3000);
    void load();
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [orderId]);

  if (status === "paid") {
    return (
      <Box title="¡Reserva confirmada!" tone="gold">
        <p className="text-bone-dim">
          Recibirás un email con el detalle. <strong className="text-bone">Coordinaremos tu acceso por
          WhatsApp</strong> antes de tu sesión.
        </p>
        <a
          href={`https://wa.me/${SITE.whatsapp}`}
          className="mt-6 inline-flex bg-gold px-6 py-3 label text-ink"
        >
          Escríbenos por WhatsApp →
        </a>
      </Box>
    );
  }

  if (status === "cancelled") {
    return (
      <Box title="El pago no se completó" tone="sirena">
        <p className="text-bone-dim">No se realizó ningún cobro. Puedes intentar de nuevo.</p>
        <Link href="/reservar" className="mt-6 inline-flex bg-gold px-6 py-3 label text-ink">
          Volver a reservar →
        </Link>
      </Box>
    );
  }

  return (
    <Box title="Confirmando tu pago…" tone="bone">
      <p className="text-bone-dim">Esto puede tomar unos segundos. No cierres esta página.</p>
    </Box>
  );
}

function Box({ title, tone, children }: { title: string; tone: "gold" | "sirena" | "bone"; children: React.ReactNode }) {
  const color = tone === "gold" ? "text-gold" : tone === "sirena" ? "text-sirena" : "text-bone";
  return (
    <div className="border hairline p-8 md:p-12">
      <h1 className={`font-display ${color}`} style={{ fontSize: "clamp(2rem,6vw,3.5rem)" }}>
        {title}
      </h1>
      <div className="mt-4">{children}</div>
    </div>
  );
}

import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import GuideUnavailable from "@/components/guides/GuideUnavailable";
import { GUIA_PENDRIVE } from "@/lib/guia-pendrive-content";
import { guideService } from "@/src/composition";

/**
 * El link del correo de esta guía: `/guia-pendrive-dj/descarga/<token>` (el servicio de
 * notificaciones lo arma desde `path` del registro). Misma resolución que /guia-dj: el
 * token es global y trae su guía; con todo en orden, redirige a una URL firmada (120 s).
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `Descarga · ${GUIA_PENDRIVE.title}`,
  robots: { index: false, follow: false },
};

export default async function DescargaGuiaPendrivePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = await guideService().resolveDownload(token);

  if (result.kind === "not_found") notFound();
  if (result.kind === "ok") redirect(result.url);

  return <GuideUnavailable guide={result.guide} />;
}

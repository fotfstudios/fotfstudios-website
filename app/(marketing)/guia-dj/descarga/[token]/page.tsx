import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import GuideUnavailable from "@/components/guides/GuideUnavailable";
import { GUIA } from "@/lib/guia-content";
import { guideService } from "@/src/composition";

/**
 * El link del correo: `/guia-dj/descarga/<token>`. Es una PÁGINA y no un route handler
 * a propósito: un token malo cae en el 404 de marca (`notFound()` en un route.ts
 * devuelve un 404 vacío), y el caso "archivo aún no subido" se puede explicar en vez de
 * fallar en seco. Con todo en orden, redirige a una URL firmada del bucket (120 s).
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `Descarga · ${GUIA.title}`,
  robots: { index: false, follow: false },
};

export default async function DescargaGuiaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = await guideService().resolveDownload(token);

  if (result.kind === "not_found") notFound();
  if (result.kind === "ok") redirect(result.url);

  return <GuideUnavailable guide={result.guide} />;
}

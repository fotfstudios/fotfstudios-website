import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Logo from "@/components/Logo";
import { UNSUBSCRIBE_TOKEN_RE } from "@/src/domain/newsletter/subscribe";
import { confirmarBaja } from "./actions";

/**
 * El link de baja de los correos del newsletter: `/baja/<token>`. El GET no toca la base
 * (los escáneres de correo lo prefetchean): muestra un botón, y la baja es su POST
 * (actions.ts). Un token con forma inválida cae en el 404 de marca.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Darse de baja",
  robots: { index: false, follow: false },
};

export default async function BajaPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await params;
  if (!UNSUBSCRIBE_TOKEN_RE.test(token)) notFound();
  const sp = await searchParams;
  const listo = sp.listo === "1";
  const error = sp.error === "1";

  return (
    <main className="mx-auto flex min-h-[70svh] w-full max-w-3xl flex-col justify-center px-6 py-24">
      <Link href="/" aria-label="FOTF Studios — volver al inicio" className="mb-12 inline-block w-fit">
        <Logo variant="mini" height={40} />
      </Link>

      {listo ? (
        <div role="status">
          <p className="label text-gold">Listo</p>
          <h1 className="font-display mt-3 text-bone" style={{ fontSize: "clamp(2.4rem,7vw,4rem)" }}>
            Te diste de baja
          </h1>
          <p className="mt-6 max-w-xl leading-relaxed text-bone-dim">
            No te vamos a escribir más con avisos de guías y posts. Si fue sin querer, puedes volver a
            suscribirte desde la página del curso.
          </p>
          <p className="mt-8">
            <Link href="/blog" className="label text-gold underline underline-offset-4">
              Seguir leyendo el blog →
            </Link>
          </p>
        </div>
      ) : error ? (
        <div role="alert">
          <p className="label text-gold">Link no válido</p>
          <h1 className="font-display mt-3 text-bone" style={{ fontSize: "clamp(2.4rem,7vw,4rem)" }}>
            No encontramos esta suscripción
          </h1>
          <p className="mt-6 max-w-xl leading-relaxed text-bone-dim">
            Puede que el link esté incompleto. Ábrelo de nuevo desde el correo, o escríbenos y te sacamos de la
            lista a mano.
          </p>
        </div>
      ) : (
        <div>
          <p className="label text-gold">Newsletter</p>
          <h1 className="font-display mt-3 text-bone" style={{ fontSize: "clamp(2.4rem,7vw,4rem)" }}>
            ¿Darte de baja?
          </h1>
          <p className="mt-6 max-w-xl leading-relaxed text-bone-dim">
            Dejarás de recibir los avisos de guías y posts nuevos de FOTF Studios. Tus reservas y
            correos de la sala no cambian.
          </p>
          <form action={confirmarBaja} className="mt-8">
            <input type="hidden" name="token" value={token} />
            <button type="submit" className="label bg-gold px-7 py-4 text-ink transition-colors hover:bg-bone">
              Confirmar baja
            </button>
          </form>
        </div>
      )}
    </main>
  );
}

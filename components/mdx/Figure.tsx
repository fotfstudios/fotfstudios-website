import Image from "next/image";

/**
 * Imagen con epígrafe. Usa next/image (no <img>) porque acá sí es el DOM del navegador:
 * el <img> crudo solo se justifica dentro de satori, en lib/og.tsx.
 *
 * `src` es una ruta bajo public/ SIN la barra inicial ("og/cabina-7.jpg"); el registro
 * comprueba en cada build que el archivo exista.
 */
export function Figure({
  src,
  alt,
  caption,
}: {
  src: string;
  alt: string;
  caption?: string;
}) {
  return (
    <figure className="mt-10">
      <Image
        src={`/${src}`}
        alt={alt}
        width={1600}
        height={900}
        sizes="(min-width: 768px) 48rem, 100vw"
        className="img-grade h-auto w-full"
      />
      {caption ? <figcaption className="label-sm mt-3 text-bone-mute">{caption}</figcaption> : null}
    </figure>
  );
}

/**
 * Parte un titular en dos líneas de largo parecido, para la tarjeta OG.
 *
 * La tarjeta de la marca son dos líneas —la primera en bone, la segunda en gold— y los
 * títulos de artículo son más largos que los de una landing, así que se parten por
 * palabras en vez de escribirse a mano en cada uno.
 */
export function splitHeadline(title: string): [string, string] {
  const words = title.trim().split(/\s+/);
  if (words.length < 2) return [title, ""];

  // El corte que deja las dos mitades más parejas.
  let best = 1;
  let bestDiff = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(" ").length;
    const b = words.slice(i).join(" ").length;
    const diff = Math.abs(a - b);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  }
  return [words.slice(0, best).join(" "), words.slice(best).join(" ")];
}

/**
 * Tamaño de fuente para el titular de la tarjeta.
 *
 * Las landings usan 126–132 con títulos de dos o tres palabras. Un título de artículo es
 * bastante más largo y a 126 se sale del lienzo, así que baja por tramos según la línea
 * más larga.
 */
export function headlineSize(lines: readonly [string, string]): number {
  const largo = Math.max(lines[0].length, lines[1].length);
  if (largo <= 12) return 112;
  if (largo <= 18) return 88;
  if (largo <= 24) return 70;
  return 58;
}

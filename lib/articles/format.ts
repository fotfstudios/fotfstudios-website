/**
 * Fecha de artículo en es-CL, en UTC.
 *
 * El frontmatter trae `yyyy-mm-dd` sin hora; `new Date("2026-09-23")` se interpreta como
 * medianoche UTC, y formatear eso en America/Santiago (UTC−3/−4) devuelve el día ANTERIOR.
 * Por eso timeZone: "UTC" — la fecha de publicación es un día del calendario, no un
 * instante.
 */
const FMT = new Intl.DateTimeFormat("es-CL", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export function formatArticleDate(iso: string): string {
  return FMT.format(new Date(`${iso}T00:00:00Z`));
}

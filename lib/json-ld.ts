/**
 * Serializa JSON-LD para incrustarlo en un <script>.
 *
 * `JSON.stringify` NO escapa `<`, `>` ni `&`, así que un valor que contenga la secuencia
 * `</script>` cierra la etiqueta y lo que siga se interpreta como HTML. Con copy escrito a
 * mano en un .ts eso es improbable; con frontmatter leído del disco es una entrada de
 * verdad, y CodeQL lo marca como stored XSS con razón.
 *
 * Los tres caracteres se escriben como escapes unicode: siguen siendo JSON válido, los
 * parsers de datos estructurados los leen igual, y ninguno puede cerrar la etiqueta.
 */
export function jsonLdHtml(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

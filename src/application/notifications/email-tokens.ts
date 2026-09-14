/**
 * Tokens de marca para email — los MISMOS valores que `app/globals.css` (el test
 * `email-tokens.test.ts` los ata). En email no hay CSS vars ni `@theme`: cada color
 * va en línea, así que este módulo es la única fuente de los hex de las plantillas.
 *
 * Sin `bone-mute` (#6f6c64, 3.78:1): en texto de correo no alcanza AA. La letra
 * menuda usa `boneQuiet` (5.61:1).
 */
export const EMAIL = {
  ink: "#0a0a0a",
  inkSoft: "#121212",
  inkLine: "#1e1d1a",
  bone: "#f5f2ec",
  boneDim: "#b9b5ab",
  boneQuiet: "#8c8880",
  gold: "#e8c94a",
  /** Solo urgencia real (la alerta al dueño de un pago sin reserva). */
  sirena: "#ff4d1d",
} as const;

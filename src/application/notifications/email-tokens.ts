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

/**
 * Tokens del design system de Claude Design (`components/ds/ds.css`) para los correos
 * del flujo de reserva — la misma excepción al Manual de Marca que la superficie de
 * reservas (CLAUDE.md → Brand guardrails): acento naranja, Anton / Space Grotesk /
 * Space Mono. `email-tokens.test.ts` ata cada hex a su variable en ds.css.
 *
 * La letra menuda usa `small` (#949086, 6.3:1 sobre la página); nunca grey-500.
 */
export const EMAIL_DS = {
  page: "#0a0a0a",
  card: "#1a1a1a",
  input: "#141413",
  line: "#272624",
  strong: "#3a3a3a",
  text: "#f5f2ec",
  text2: "#b9b4a9",
  small: "#949086",
  orange: "#ff4d1d",
  gold: "#e8c94a",
  ok: "#45c065",
  danger: "#e5484d",
} as const;

/** Variable de `components/ds/ds.css` de la que sale cada token (para el test). */
export const EMAIL_DS_SOURCE: Record<keyof typeof EMAIL_DS, string> = {
  page: "black-950",
  card: "black-900",
  input: "surface-input",
  line: "border-subtle",
  strong: "grey-700",
  text: "cream",
  text2: "grey-300",
  small: "grey-400",
  orange: "orange",
  gold: "gold",
  ok: "success",
  danger: "danger",
};

/**
 * Pilas tipográficas con respaldo: las fuentes se sirven desde /email/fonts (Apple Mail,
 * iOS y Samsung las cargan); Gmail y Outlook caen al respaldo y la jerarquía se sostiene.
 */
export const EMAIL_FONTS = {
  display: "'Anton',Impact,'Arial Narrow',sans-serif",
  body: "'Space Grotesk',Arial,Helvetica,sans-serif",
  mono: "'Space Mono','Courier New',monospace",
} as const;

/**
 * Logos y fuentes de los correos: URL absoluta y pública (un correo no resuelve rutas
 * relativas, y Gmail no renderiza SVG — por eso PNG). Siempre producción: el `localhost`
 * de dev no es alcanzable desde un cliente de correo.
 */
export const EMAIL_ASSET_BASE = "https://www.fotfstudios.cl/email";

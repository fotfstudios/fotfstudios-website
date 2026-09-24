import { formatPoints } from "@/src/domain/points/points";

/**
 * Formato de puntos (1 punto = $1 CLP, pero se muestran sin "$"). La
 * implementación vive en el dominio: el correo del saldo la necesita y `src/`
 * no puede importar desde `components/`. Este alias se queda por los call sites.
 */
export const fmtPts = formatPoints;

/** Con signo explícito para el historial: +499 / −4.000. */
export const fmtPtsSigned = (n: number): string => (n >= 0 ? `+${fmtPts(n)}` : `−${fmtPts(Math.abs(n))}`);

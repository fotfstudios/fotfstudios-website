/** Formato de puntos (1 punto = $1 CLP, pero se muestran sin "$"). */
export const fmtPts = (n: number): string => Math.round(n).toLocaleString("es-CL");

/** Con signo explícito para el historial: +499 / −4.000. */
export const fmtPtsSigned = (n: number): string => (n >= 0 ? `+${fmtPts(n)}` : `−${fmtPts(Math.abs(n))}`);

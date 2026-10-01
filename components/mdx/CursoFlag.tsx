import type { ReactNode } from "react";
import { CURSO_ABIERTO } from "@/lib/flags";

/**
 * Copy que depende de si el Curso de DJ está abierto (lib/flags.ts → CURSO_ABIERTO).
 * Un artículo MDX que menciona precios o inscripciones lo envuelve aquí en vez de
 * quedar mintiendo cuando el curso se pausa.
 */
export function CursoAbierto({ children }: { children: ReactNode }) {
  return CURSO_ABIERTO ? <>{children}</> : null;
}

export function CursoEnPausa({ children }: { children: ReactNode }) {
  return CURSO_ABIERTO ? null : <>{children}</>;
}

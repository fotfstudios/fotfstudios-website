import type { ReactNode } from "react";

/**
 * Tabla de datos: borde hairline, cabecera mono, filas con hover. Scroll en móvil.
 * `caption` le da nombre accesible (sr-only): con dos tablas en una página, el lector
 * de pantalla anuncia "tabla, tabla" sin ella.
 */
export function DataTable({
  head,
  children,
  caption,
  minWidthClassName = "min-w-[34rem]",
}: {
  head: ReactNode;
  children: ReactNode;
  caption?: string;
  minWidthClassName?: string;
}) {
  return (
    <div className="overflow-x-auto border hairline">
      <table className={`w-full ${minWidthClassName} text-sm`}>
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr className="border-b hairline bg-ink/60">{head}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Th({ children, right }: { children?: ReactNode; right?: boolean }) {
  return (
    <th scope="col" className={`label px-4 py-3 font-medium text-bone-quiet ${right ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}

export function Tr({
  children,
  muted,
  className = "",
}: {
  children: ReactNode;
  muted?: boolean;
  className?: string;
}) {
  return (
    <tr
      className={`border-b hairline transition-colors last:border-0 hover:bg-ink-soft ${muted ? "opacity-60" : ""} ${className}`}
    >
      {children}
    </tr>
  );
}

export function Td({
  children,
  right,
  className = "",
}: {
  children?: ReactNode;
  right?: boolean;
  className?: string;
}) {
  return <td className={`px-4 py-3.5 align-middle ${right ? "text-right" : ""} ${className}`}>{children}</td>;
}

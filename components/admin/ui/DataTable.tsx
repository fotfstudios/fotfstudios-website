import type { ReactNode } from "react";

/** Tabla de datos: borde hairline, cabecera mono, filas con hover. Scroll en móvil. */
export function DataTable({ head, children }: { head: ReactNode; children: ReactNode }) {
  return (
    <div className="overflow-x-auto border hairline">
      <table className="w-full min-w-[34rem] text-sm">
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
    <th className={`label-sm px-4 py-3 font-medium text-bone-mute ${right ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}

export function Tr({ children, muted }: { children: ReactNode; muted?: boolean }) {
  return (
    <tr className={`border-b hairline transition-colors last:border-0 hover:bg-ink-soft ${muted ? "opacity-60" : ""}`}>
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

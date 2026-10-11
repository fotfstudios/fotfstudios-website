import type { ReactNode } from "react";

/** Badge del design system (components/core/Badge.jsx): etiqueta mono en píldora. */
export default function Badge({
  variant = "neutral",
  dot = false,
  className = "",
  children,
}: {
  variant?: "neutral" | "accent" | "gold" | "success" | "danger" | "live";
  dot?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span className={`ds-badge ${variant === "neutral" ? "" : `ds-badge--${variant}`} ${className}`.replace(/\s+/g, " ").trim()}>
      {dot && <i className="ds-badge-dot" aria-hidden="true" />}
      {children}
    </span>
  );
}

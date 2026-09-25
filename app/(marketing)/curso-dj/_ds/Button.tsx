import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * Button del design system (components/core/Button.jsx en Claude Design), portado a
 * clases: hover/press viven en curso-ds.css en vez de estado JS. Con `href` rinde un
 * <a> (anclas de la página); sin él, un <button>.
 */
type Props = {
  variant?: "primary" | "secondary" | "gold" | "ghost";
  size?: "sm" | "md" | "lg";
  glow?: boolean;
  fullWidth?: boolean;
  href?: string;
  className?: string;
  children: ReactNode;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children">;

export function dsButtonClass({
  variant = "primary",
  size = "md",
  glow = false,
  fullWidth = false,
}: Pick<Props, "variant" | "size" | "glow" | "fullWidth"> = {}) {
  return [
    "ds-btn",
    `ds-btn--${variant}`,
    `ds-btn--${size}`,
    glow && variant === "primary" ? "ds-btn--glow" : "",
    fullWidth ? "ds-btn--full" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export default function Button({
  variant,
  size,
  glow,
  fullWidth,
  href,
  className = "",
  children,
  type = "button",
  ...rest
}: Props) {
  const cls = `${dsButtonClass({ variant, size, glow, fullWidth })} ${className}`.trim();
  if (href) {
    return (
      <a href={href} className={cls} tabIndex={rest.tabIndex}>
        {children}
      </a>
    );
  }
  return (
    <button type={type} className={cls} {...rest}>
      {children}
    </button>
  );
}

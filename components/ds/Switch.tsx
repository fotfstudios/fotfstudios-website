import type { InputHTMLAttributes, ReactNode } from "react";

/**
 * Switch del design system (components/forms/Switch.jsx): checkbox nativo con
 * `role="switch"`, visualmente oculto; la pista y el botón se pintan en ds.css.
 * Sin `children` necesita `aria-label` o `aria-labelledby`.
 */
type Props = {
  children?: ReactNode;
  className?: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "role" | "className" | "children">;

export default function Switch({ children, className = "", ...rest }: Props) {
  return (
    <label className={`ds-switch ${className}`.trim()}>
      <input type="checkbox" role="switch" className="ds-sr-input" {...rest} />
      <span className="ds-switch-track" aria-hidden="true" />
      {children && <span>{children}</span>}
    </label>
  );
}

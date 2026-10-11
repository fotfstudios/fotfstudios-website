import type { InputHTMLAttributes, ReactNode } from "react";

/**
 * Checkbox del design system (components/forms/Checkbox.jsx en Claude Design), portado a
 * clases: el <input> nativo queda visualmente oculto dentro del <label> y el estado se
 * pinta con `:has(:checked)` en ds.css, así funciona controlado o no y con teclado.
 */
type Props = {
  children: ReactNode;
  className?: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "className" | "children">;

export default function Checkbox({ children, className = "", ...rest }: Props) {
  return (
    <label className={`ds-check ${className}`.trim()}>
      <input type="checkbox" className="ds-sr-input" {...rest} />
      <span className="ds-check-box" aria-hidden="true">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </span>
      <span>{children}</span>
    </label>
  );
}

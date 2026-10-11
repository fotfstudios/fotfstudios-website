import type { ReactNode } from "react";
import { clMobileDigits, formatClMobile } from "@/lib/phone-input";

/**
 * Celular chileno: caja fija "+56" + el número local, formateado "9 1234 5678" al teclear.
 * Acepta pegado o autocompletado con "+56 9 …" (se queda con los dígitos locales).
 */
export default function PhoneInput({
  digits,
  onDigits,
  onBlur,
  error,
  disabled = false,
  trailing,
}: {
  digits: string;
  onDigits: (digits: string) => void;
  onBlur: () => void;
  error?: string;
  /** Bloqueado: dato guardado en la cuenta (se desbloquea con "Editar"). */
  disabled?: boolean;
  /** Controles dentro de la caja, a la derecha (lápiz / ✓ ✕). */
  trailing?: ReactNode;
}) {
  const msgId = "bk-phone-msg";
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="bk-phone" className="ds-eyebrow text-[var(--text-secondary)]">
        Celular
      </label>
      <div
        className={`flex items-stretch overflow-hidden rounded-[6px] border transition-colors focus-within:border-[var(--accent)] ${
          error
            ? "border-[var(--danger)] bg-[var(--surface-input)]"
            : disabled
              ? "border-[var(--border-subtle)] bg-transparent"
              : "border-[var(--border-control)] bg-[var(--surface-input)]"
        }`}
      >
        <span aria-hidden="true" className="ds-mono flex items-center border-r border-[var(--border-subtle)] px-3 text-sm text-[var(--text-secondary)]">
          +56
        </span>
        <input
          id="bk-phone"
          type="tel"
          autoComplete="tel"
          inputMode="numeric"
          placeholder="9 1234 5678"
          aria-invalid={error ? true : undefined}
          aria-describedby={msgId}
          disabled={disabled}
          value={formatClMobile(digits)}
          onChange={(e) => onDigits(clMobileDigits(e.target.value))}
          onBlur={onBlur}
          className="ds-mono h-11 min-w-0 flex-1 bg-transparent px-3 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--grey-500)] disabled:text-[var(--text-secondary)]"
        />
        {trailing && <span className="flex items-center pr-1">{trailing}</span>}
      </div>
      <span id={msgId} className={`min-h-4 text-xs ${error ? "text-[var(--danger)]" : "text-[var(--text-muted)]"}`}>
        {error ?? "Solo Chile (+56). Te avisamos por WhatsApp si hay un cambio."}
      </span>
    </div>
  );
}

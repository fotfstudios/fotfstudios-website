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
}: {
  digits: string;
  onDigits: (digits: string) => void;
  onBlur: () => void;
  error?: string;
}) {
  const msgId = "bk-phone-msg";
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="bk-phone" className="ds-eyebrow text-[var(--text-secondary)]">
        Celular
      </label>
      <div
        className={`flex items-stretch overflow-hidden rounded-[6px] border bg-[var(--surface-input)] transition-colors focus-within:border-[var(--accent)] ${
          error ? "border-[var(--danger)]" : "border-[var(--border-control)]"
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
          value={formatClMobile(digits)}
          onChange={(e) => onDigits(clMobileDigits(e.target.value))}
          onBlur={onBlur}
          className="ds-mono h-11 min-w-0 flex-1 bg-transparent px-3 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--grey-500)]"
        />
      </div>
      <span id={msgId} className={`min-h-4 text-xs ${error ? "text-[var(--danger)]" : "text-[var(--text-muted)]"}`}>
        {error ?? "Solo Chile (+56). Te avisamos por WhatsApp si hay un cambio."}
      </span>
    </div>
  );
}

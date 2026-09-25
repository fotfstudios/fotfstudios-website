"use client";

import { useId, type InputHTMLAttributes, type ReactNode, type Ref, type TextareaHTMLAttributes } from "react";

/**
 * Field + Input del design system (components/forms/Input.jsx). La etiqueta es la
 * eyebrow del sistema; hint y error se enlazan por aria-describedby para que el
 * lector de pantalla los lea con el control.
 */
export function Field({
  label,
  hint,
  error,
  htmlFor,
  describedBy,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  htmlFor: string;
  describedBy: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="ds-eyebrow text-[var(--text-secondary)]">
        {label}
        {hint && <span className="ml-2 normal-case tracking-normal text-[var(--text-muted)]">{hint}</span>}
      </label>
      {children}
      {error && (
        <span id={describedBy} className="text-[13px] text-[var(--danger)]">
          {error}
        </span>
      )}
    </div>
  );
}

type InputProps = {
  label: string;
  hint?: string;
  error?: string;
  mono?: boolean;
  inputRef?: Ref<HTMLInputElement>;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "className">;

export default function Input({ label, hint, error, mono = false, inputRef, id, ...rest }: InputProps) {
  const auto = useId();
  const inputId = id ?? auto;
  const errId = `${inputId}-err`;
  return (
    <Field label={label} hint={hint} error={error} htmlFor={inputId} describedBy={errId}>
      <input
        ref={inputRef}
        id={inputId}
        className={`ds-input ${mono ? "ds-input--mono" : ""}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errId : undefined}
        {...rest}
      />
    </Field>
  );
}

type TextareaProps = {
  label: string;
  hint?: string;
  error?: string;
  textareaRef?: Ref<HTMLTextAreaElement>;
} & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "className">;

export function Textarea({ label, hint, error, textareaRef, id, ...rest }: TextareaProps) {
  const auto = useId();
  const inputId = id ?? auto;
  const errId = `${inputId}-err`;
  return (
    <Field label={label} hint={hint} error={error} htmlFor={inputId} describedBy={errId}>
      <textarea
        ref={textareaRef}
        id={inputId}
        className="ds-input"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errId : undefined}
        {...rest}
      />
    </Field>
  );
}

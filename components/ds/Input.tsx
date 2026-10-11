"use client";

import { useId, type InputHTMLAttributes, type ReactNode, type Ref, type TextareaHTMLAttributes } from "react";

/**
 * Field + Input del design system (components/forms/Input.jsx). La etiqueta es la
 * eyebrow del sistema; `hint` va junto a la etiqueta y `help` bajo el control. help y
 * error se enlazan por aria-describedby para que el lector de pantalla los lea con el control.
 */
export function Field({
  label,
  hint,
  help,
  error,
  htmlFor,
  describedBy,
  children,
}: {
  label: string;
  hint?: string;
  help?: string;
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
      {help && (
        <span id={`${htmlFor}-help`} className="text-[13px] text-[var(--text-muted)]">
          {help}
        </span>
      )}
      {error && (
        <span id={describedBy} className="text-[13px] text-[var(--danger)]">
          {error}
        </span>
      )}
    </div>
  );
}

/** ids para aria-describedby: ayuda y error, en ese orden (undefined si no hay ninguno). */
function describedByIds(inputId: string, help?: string, error?: string): string | undefined {
  return [help && `${inputId}-help`, error && `${inputId}-err`].filter(Boolean).join(" ") || undefined;
}

type InputProps = {
  label: string;
  hint?: string;
  help?: string;
  error?: string;
  mono?: boolean;
  inputRef?: Ref<HTMLInputElement>;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "className">;

export default function Input({ label, hint, help, error, mono = false, inputRef, id, ...rest }: InputProps) {
  const auto = useId();
  const inputId = id ?? auto;
  const errId = `${inputId}-err`;
  return (
    <Field label={label} hint={hint} help={help} error={error} htmlFor={inputId} describedBy={errId}>
      <input
        ref={inputRef}
        id={inputId}
        className={`ds-input ${mono ? "ds-input--mono" : ""}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedByIds(inputId, help, error)}
        {...rest}
      />
    </Field>
  );
}

type TextareaProps = {
  label: string;
  hint?: string;
  help?: string;
  error?: string;
  textareaRef?: Ref<HTMLTextAreaElement>;
} & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "className">;

export function Textarea({ label, hint, help, error, textareaRef, id, ...rest }: TextareaProps) {
  const auto = useId();
  const inputId = id ?? auto;
  const errId = `${inputId}-err`;
  return (
    <Field label={label} hint={hint} help={help} error={error} htmlFor={inputId} describedBy={errId}>
      <textarea
        ref={textareaRef}
        id={inputId}
        className="ds-input"
        aria-invalid={error ? true : undefined}
        aria-describedby={describedByIds(inputId, help, error)}
        {...rest}
      />
    </Field>
  );
}

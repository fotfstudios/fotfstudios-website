"use client";

import { Fragment } from "react";
import Button from "@/components/ds/Button";
import Checkbox from "@/components/ds/Checkbox";
import Input from "@/components/ds/Input";
import Switch from "@/components/ds/Switch";
import { formatCLP } from "@/src/domain/money/money";
import type { useOtpLogin } from "@/components/cuenta/useOtpLogin";
import PhoneInput from "./PhoneInput";
import SectionHead from "./SectionHead";

export interface BookingCustomer {
  email: string;
  name: string;
  phone: string;
  points: number;
  /** Solo cuando parte del saldo vence en ≤ 30 días: "500 vencen el …". */
  pointsExpiryNote?: string | null;
  whatsappOptIn: boolean;
}

/**
 * 03 Tus datos: email, nombre y celular (una sola vez: confirmación, código de acceso y
 * comprobante), consentimiento de WhatsApp, acceso con código sin salir del flujo y, con
 * sesión, el canje de Beatcoins. Dueña de los ids `bk-*` que usa el CTA para hacer scroll.
 */
export default function CustomerSection({
  n,
  customer,
  accountOn,
  email,
  onEmail,
  onEmailBlur,
  emailError,
  emailHint,
  name,
  onName,
  nameError,
  phoneDigits,
  onPhoneDigits,
  onPhoneBlur,
  phoneError,
  phoneValid,
  whatsappOptIn,
  onWhatsappOptIn,
  login,
  loginOpen,
  onLoginOpen,
  loginCode,
  onLoginCode,
  onSendCode,
  onVerifyCode,
  usePoints,
  onUsePoints,
  pointsApplied,
}: {
  n?: string;
  customer: BookingCustomer | null;
  accountOn: boolean;
  email: string;
  onEmail: (v: string) => void;
  onEmailBlur: () => void;
  emailError?: string;
  emailHint: string;
  name: string;
  onName: (v: string) => void;
  nameError?: string;
  phoneDigits: string;
  onPhoneDigits: (v: string) => void;
  onPhoneBlur: () => void;
  phoneError?: string;
  phoneValid: boolean;
  whatsappOptIn: boolean;
  onWhatsappOptIn: (v: boolean) => void;
  login: ReturnType<typeof useOtpLogin>;
  loginOpen: boolean;
  onLoginOpen: (open: boolean) => void;
  loginCode: string;
  onLoginCode: (v: string) => void;
  onSendCode: () => void;
  onVerifyCode: () => void;
  usePoints: boolean;
  onUsePoints: (v: boolean) => void;
  pointsApplied: number;
}) {
  const canLogin = accountOn && !customer;
  const initials = (customer?.name || customer?.email || "DJ").slice(0, 2).toUpperCase();

  return (
    <section className="flex flex-col gap-3.5" aria-labelledby="bk-data-title">
      <SectionHead
        id="bk-data-title"
        n={n}
        title="Tus datos"
        aside={
          canLogin && (
            <button
              type="button"
              onClick={() => {
                onLoginCode("");
                login.changeEmail();
                onLoginOpen(!loginOpen);
                // El correo se escribe abajo: si está vacío, llevamos el foco ahí.
                if (!loginOpen && !email.trim()) document.getElementById("bk-email")?.focus();
              }}
              className="py-2 text-[13px] text-[var(--accent)] transition-colors hover:text-[var(--accent-hover)]"
            >
              {loginOpen ? "Seguir como invitado" : "¿Tienes cuenta? Inicia sesión"}
            </button>
          )
        }
      >
        Tres datos, una sola vez: sirven para la confirmación, el código de acceso y el comprobante.
      </SectionHead>

      <div className="grid max-w-[760px] gap-4 sm:grid-cols-2">
        <Input
          id="bk-email"
          autoComplete="email"
          type="email"
          inputMode="email"
          label="Email"
          placeholder="tu@email.cl"
          help={emailHint}
          error={emailError}
          value={email}
          disabled={!!customer}
          onChange={(e) => onEmail(e.target.value)}
          onBlur={onEmailBlur}
        />
        <Input
          id="bk-name"
          autoComplete="name"
          label="Nombre"
          placeholder="Tu nombre o alias DJ"
          error={nameError}
          value={name}
          onChange={(e) => onName(e.target.value)}
        />
        <PhoneInput digits={phoneDigits} onDigits={onPhoneDigits} onBlur={onPhoneBlur} error={phoneError} />
      </div>

      <Checkbox checked={phoneValid && whatsappOptIn} disabled={!phoneValid} onChange={(e) => onWhatsappOptIn(e.target.checked)}>
        {phoneValid
          ? "Avísame también por WhatsApp (confirmación, recordatorio, código de acceso y pagos). Lo puedes desactivar en tu cuenta."
          : "Agrega tu celular para recibir también los avisos por WhatsApp."}
      </Checkbox>

      {canLogin && loginOpen && (
        <div className="ds-card flex max-w-[480px] flex-col gap-3.5 p-5">
          {/* Los dos pasos van con key: misma forma JSX → sin key React reutilizaría el MISMO
              <input>, y el del código nunca se montaría (su autoFocus no correría). */}
          {login.state.step === "email" ? (
            <Fragment key="email">
              <p className="text-[13px] text-[var(--text-secondary)]">
                Te enviamos un código a{" "}
                <b className="ds-mono font-normal text-[var(--text-primary)]">{email.trim() || "tu correo"}</b>, sin salir de
                aquí.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="secondary" onClick={onSendCode} disabled={login.state.busy || !email.trim()}>
                  {login.state.busy ? "Enviando…" : "Enviar código"}
                </Button>
                <button type="button" onClick={() => onLoginOpen(false)} className="text-[13px] text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                  Cancelar
                </button>
              </div>
            </Fragment>
          ) : (
            <Fragment key="code">
              <p className="text-[13px] text-[var(--text-secondary)]">
                Escribe el código que enviamos a{" "}
                <b className="ds-mono font-normal text-[var(--text-primary)]">{login.state.sentTo}</b>.
              </p>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="bk-login-code" className="ds-eyebrow text-[var(--text-secondary)]">
                  Código del correo
                </label>
                <input
                  id="bk-login-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  // Al cambiar de paso el input anterior se desmonta: sin esto el teclado del
                  // teléfono se cierra y hay que volver a tocar el campo.
                  autoFocus
                  className="ds-input ds-input--mono"
                  value={loginCode}
                  onChange={(e) => onLoginCode(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && onVerifyCode()}
                />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="secondary" onClick={onVerifyCode} disabled={login.state.busy || !loginCode.trim()}>
                  {login.state.verified ? "Iniciando sesión…" : login.state.busy ? "Verificando…" : "Verificar"}
                </Button>
                <button
                  type="button"
                  onClick={() => void login.resend()}
                  disabled={login.state.busy}
                  className="text-[13px] text-[var(--accent)] hover:text-[var(--accent-hover)] disabled:opacity-40"
                >
                  Reenviar código
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onLoginCode("");
                    login.changeEmail();
                  }}
                  disabled={login.state.busy}
                  className="text-[13px] text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-40"
                >
                  Cambiar correo
                </button>
              </div>
            </Fragment>
          )}
          {login.state.error && (
            <p role="alert" className="text-[13px] text-[var(--danger)]">
              {login.state.error}
            </p>
          )}
        </div>
      )}

      {customer ? (
        <div className="flex max-w-[760px] flex-col gap-3">
          <div className="ds-card flex flex-wrap items-center gap-4 px-5 py-4">
            <span
              aria-hidden="true"
              className="flex size-11 items-center justify-center rounded-full border border-[var(--border-strong)] bg-[var(--surface-raised)] font-[family-name:var(--font-ds-display)] text-lg text-[var(--accent)]"
            >
              {initials}
            </span>
            <span className="flex min-w-40 flex-1 flex-col gap-0.5">
              <span className="text-[15px] font-medium">Sesión iniciada como</span>
              <span className="ds-mono text-xs text-[var(--text-muted)]">{customer.email}</span>
            </span>
          </div>
          {customer.points > 0 && (
            <div className="ds-card flex items-center gap-4 px-5 py-4">
              <span className="flex flex-1 flex-col gap-1">
                <span id="bk-points-label" className="text-[15px] font-medium">
                  Usar mis Beatcoins
                </span>
                <span className="text-[13px] text-[var(--text-muted)]">
                  Tienes <span className="ds-mono text-[var(--gold)]">{formatCLP(customer.points)}</span> en Beatcoins.
                  Se aplican después del descuento
                  {usePoints && pointsApplied > 0 ? `: −${formatCLP(pointsApplied)}.` : "."}
                </span>
                {customer.pointsExpiryNote && (
                  <span className="text-[13px] text-[var(--text-muted)]">{customer.pointsExpiryNote}</span>
                )}
              </span>
              <Switch aria-labelledby="bk-points-label" checked={usePoints} onChange={(e) => onUsePoints(e.target.checked)} />
            </div>
          )}
        </div>
      ) : (
        <p className="text-xs text-[var(--text-muted)]">Sin cuenta ni contraseña. No compartimos tus datos.</p>
      )}
    </section>
  );
}

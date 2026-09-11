"use client";

import { useState, useTransition } from "react";
import { Field, Input } from "@/components/admin/ui/Field";
import { btn } from "@/components/admin/ui/styles";
import { CUSTOMER_CAPS, customerLabel } from "@/src/domain/customers/customer-input";
import type { CustomerProfile } from "@/src/application/ports/customers";
import type { CreateCustomerOutcome } from "@/src/application/customers/customer-directory-service";

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

export interface NuevoClienteFormProps {
  create: (raw: { name: string; email: string; phone: string }) => Promise<ActionResult<CreateCustomerOutcome>>;
  /** Aviso blando: el teléfono ya está en el directorio. Nunca decide por el staff. */
  lookupPhone?: (phone: string) => Promise<ActionResult<CustomerProfile | null>>;
  prefill?: { name?: string; email?: string; phone?: string };
  onCreated: (c: CustomerProfile) => void;
  onCancel: () => void;
  /** Texto del CTA. En la consola se crea Y se selecciona; en el directorio solo se crea. */
  submitLabel?: string;
}

/**
 * Alta rápida desde la consola. NO es un Dialog: se renderiza como un paso
 * DENTRO del diálogo que la hospeda, porque anidar diálogos rompe el foco y
 * deja dos capas de overlay que en móvil no se pueden cerrar.
 *
 * Usa `useTransition` en vez de `ActionForm` porque necesita el VALOR de vuelta
 * (la ficha creada, o la que ya existía) para seleccionarla — `ActionForm` solo
 * sabe de éxito y error.
 */
export function NuevoClienteForm({
  create,
  lookupPhone,
  prefill,
  onCreated,
  onCancel,
  submitLabel = "Crear y seleccionar",
}: NuevoClienteFormProps) {
  const [name, setName] = useState(prefill?.name ?? "");
  const [email, setEmail] = useState(prefill?.email ?? "");
  const [phone, setPhone] = useState(prefill?.phone ?? "");
  const [error, setError] = useState<string | null>(null);
  /** Ficha que ya existe con ese email o teléfono; se ofrece en vez de duplicar. */
  const [dup, setDup] = useState<{ customer: CustomerProfile; reason: "email" | "phone" } | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const res = await create({ name, email, phone });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // `exists` no es un error: el email ya era de alguien. Se ofrece esa ficha.
      if (res.data.kind === "exists") setDup({ customer: res.data.customer, reason: "email" });
      else onCreated(res.data.customer);
    });
  };

  /** Al salir del teléfono: avisa si ya existe, sin bloquear ni elegir. */
  const onPhoneBlur = () => {
    if (!lookupPhone || !phone.trim() || dup?.reason === "email") return;
    void lookupPhone(phone).then((res) => {
      if (res.ok && res.data) setDup({ customer: res.data, reason: "phone" });
      else if (dup?.reason === "phone") setDup(null);
    });
  };

  return (
    <div className="space-y-4">
      <Field label="Nombre">
        <Input
          autoFocus
          value={name}
          maxLength={CUSTOMER_CAPS.name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="off"
        />
      </Field>
      <Field label="Email" hint="Opcional si hay teléfono">
        <Input
          type="email"
          value={email}
          maxLength={CUSTOMER_CAPS.email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (dup?.reason === "email") setDup(null);
          }}
          autoComplete="off"
        />
      </Field>
      <Field label="Teléfono" hint="Opcional si hay email. +56 9 …">
        <Input
          type="tel"
          inputMode="tel"
          value={phone}
          maxLength={CUSTOMER_CAPS.phone}
          onChange={(e) => setPhone(e.target.value)}
          onBlur={onPhoneBlur}
          autoComplete="off"
        />
      </Field>

      {dup && (
        <div className="border hairline p-3">
          <p className="label-sm text-bone-dim">
            {dup.reason === "email"
              ? `Ese email ya pertenece a ${customerLabel(dup.customer)}.`
              : `Ese teléfono ya figura en ${customerLabel(dup.customer)}.`}
          </p>
          <button type="button" className={`${btn("secondary", "sm")} mt-2`} onClick={() => onCreated(dup.customer)}>
            Usar ese cliente
          </button>
        </div>
      )}

      {error && <p className="label-sm text-sirena">{error}</p>}

      <div className="flex justify-end gap-3">
        <button type="button" className={btn("secondary", "sm")} onClick={onCancel} disabled={pending}>
          Cancelar
        </button>
        <button type="button" className={btn("primary", "sm")} onClick={submit} disabled={pending}>
          {pending ? "Creando…" : submitLabel}
        </button>
      </div>
    </div>
  );
}

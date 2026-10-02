import type { Metadata } from "next";
import { Card } from "@/components/admin/ui/Card";
import { ActionForm } from "@/components/admin/ui/ActionForm";
import { Field, Input } from "@/components/admin/ui/Field";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { SubmitButton } from "@/components/admin/ui/SubmitButton";
import { customerService } from "@/src/composition";
import { requireCustomer } from "@/src/infrastructure/auth/require-customer";
import { updateProfileAction } from "./actions";

export const metadata: Metadata = { title: "Mi perfil", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * Perfil: nombre/teléfono editables (prefill de futuras reservas) y el interruptor de avisos por
 * WhatsApp; el email es la identidad.
 */
export default async function CuentaPerfil() {
  const session = await requireCustomer();
  const profile = await customerService().profileByUser(session.userId);

  return (
    <main className="space-y-8">
      <PageHeader title="Tu perfil" />

      <Card>
        <ActionForm action={updateProfileAction} success="Perfil actualizado" className="max-w-md space-y-4">
          <Field label="Correo" hint="Tu correo es tu acceso y no se puede cambiar.">
            <Input value={session.email} disabled />
          </Field>
          <Field label="Nombre">
            <Input name="name" autoComplete="name" defaultValue={profile?.name ?? ""} maxLength={80} placeholder="Tu nombre" />
          </Field>
          <Field label="Teléfono">
            <Input name="phone" type="tel" autoComplete="tel" defaultValue={profile?.phone ?? ""} placeholder="+56 9 …" />
          </Field>
          <label className="flex items-start gap-2.5 text-sm text-bone-dim">
            <input
              type="checkbox"
              name="whatsapp"
              defaultChecked={profile?.whatsapp.optIn ?? false}
              className="mt-0.5 h-4 w-4 shrink-0 accent-gold"
            />
            <span className="leading-relaxed">
              Avisos por WhatsApp: confirmación, recordatorio, código de acceso y pagos pendientes de tus
              reservas. Solo a celulares chilenos; el correo te llega siempre.
            </span>
          </label>
          <input type="hidden" name="whatsapp_field" value="1" />
          <SubmitButton pendingLabel="Guardando…">Guardar cambios</SubmitButton>
        </ActionForm>
      </Card>
    </main>
  );
}

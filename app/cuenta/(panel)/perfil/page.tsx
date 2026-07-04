import type { Metadata } from "next";
import { Card } from "@/components/admin/ui/Card";
import { ActionForm } from "@/components/admin/ui/ActionForm";
import { Field, Input } from "@/components/admin/ui/Field";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { SubmitButton } from "@/components/admin/ui/SubmitButton";
import { customerService } from "@/src/composition";
import { requireCustomer } from "@/src/infrastructure/auth/require-customer";
import { updateProfileAction } from "./actions";

export const metadata: Metadata = { title: "Mi perfil — FOTF Studios", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Perfil: nombre/teléfono editables (prefill de futuras reservas); el email es la identidad. */
export default async function CuentaPerfil() {
  const session = await requireCustomer();
  const profile = await customerService().profile(session.userId);

  return (
    <main className="space-y-8">
      <PageHeader kicker="Mi cuenta" title="Tu perfil" editorial="Para que reservar sea un solo clic." />

      <Card>
        <ActionForm action={updateProfileAction} success="Perfil actualizado" className="max-w-md space-y-4">
          <Field label="Correo" hint="Tu correo es tu acceso y no se puede cambiar.">
            <Input value={session.email} disabled />
          </Field>
          <Field label="Nombre">
            <Input name="name" defaultValue={profile?.name ?? ""} maxLength={80} placeholder="Tu nombre" />
          </Field>
          <Field label="Teléfono">
            <Input name="phone" type="tel" defaultValue={profile?.phone ?? ""} placeholder="+56 9 …" />
          </Field>
          <SubmitButton pendingLabel="Guardando…">Guardar cambios</SubmitButton>
        </ActionForm>
      </Card>
    </main>
  );
}

import { ActionForm } from "@/components/admin/ui/ActionForm";
import { Card } from "@/components/admin/ui/Card";
import { ConfirmForm } from "@/components/admin/ui/ConfirmForm";
import { Field, Input } from "@/components/admin/ui/Field";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { SubmitButton } from "@/components/admin/ui/SubmitButton";
import type { PermissionView } from "@/src/application/ports/members";
import { memberService } from "@/src/composition";
import { requirePermission } from "@/src/infrastructure/auth/require-admin";
import { createRoleAction, deleteRoleAction, setRolePermissionsAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Roles — Admin", robots: { index: false } };

const GROUPS = [
  { title: "Reservas", prefix: "reservations." },
  { title: "Bloqueos", prefix: "blocks." },
  { title: "Administración", test: (k: string) => k.startsWith("members.") || k.startsWith("roles.") },
];

function grouped(perms: PermissionView[]) {
  return GROUPS.map((g) => ({
    title: g.title,
    items: perms.filter((p) => ("prefix" in g && g.prefix ? p.key.startsWith(g.prefix) : g.test?.(p.key))),
  })).filter((g) => g.items.length > 0);
}

function PermGrid({ perms, checked, disabled }: { perms: PermissionView[]; checked: Set<string>; disabled?: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      {grouped(perms).map((g) => (
        <fieldset key={g.title}>
          <legend className="label-sm text-bone-mute">{g.title}</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {g.items.map((p) => (
              <label key={p.key} className="flex items-center gap-2.5 text-sm text-bone-dim">
                <input
                  type="checkbox"
                  name="permissions"
                  value={p.key}
                  defaultChecked={checked.has(p.key)}
                  disabled={disabled}
                  className="h-4 w-4 accent-gold"
                />
                {p.label}
              </label>
            ))}
          </div>
        </fieldset>
      ))}
    </div>
  );
}

export default async function RolesPage() {
  await requirePermission("roles.manage");
  const svc = memberService();
  const [roles, permissions] = await Promise.all([svc.listRolesWithPermissions(), svc.listPermissions()]);
  const allKeys = new Set(permissions.map((p) => p.key));

  return (
    <>
      <PageHeader kicker="Configuración" title="Roles" editorial="Lo que cada quien puede hacer." />

      <div className="mt-8 flex flex-col gap-4">
        {roles.map((role) => (
          <div key={role.id} className="border hairline bg-ink/40">
            <header className="flex items-center justify-between gap-4 border-b hairline px-5 py-3.5">
              <h3 className="font-display text-xl text-bone">{role.name}</h3>
              {role.isSystem ? (
                <span className="label-sm text-bone-mute">Sistema · todos los permisos</span>
              ) : (
                <ConfirmForm
                  action={deleteRoleAction}
                  hidden={{ roleId: role.id }}
                  trigger={{ label: "Eliminar", variant: "ghost", size: "sm" }}
                  title="Eliminar rol"
                  message={`El rol "${role.name}" se eliminará. No se puede si hay miembros con este rol.`}
                  cta="Eliminar rol"
                  success="Rol eliminado."
                />
              )}
            </header>
            <div className="p-5">
              {role.isSystem ? (
                <PermGrid perms={permissions} checked={allKeys} disabled />
              ) : (
                <ActionForm action={setRolePermissionsAction} success="Permisos guardados." className="flex flex-col gap-5">
                  <input type="hidden" name="roleId" value={role.id} />
                  <PermGrid perms={permissions} checked={new Set(role.permissions)} />
                  <div>
                    <SubmitButton size="sm">Guardar permisos</SubmitButton>
                  </div>
                </ActionForm>
              )}
            </div>
          </div>
        ))}
      </div>

      <h2 className="mt-10 mb-3 label text-bone-mute">Nuevo rol</h2>
      <Card>
        <ActionForm action={createRoleAction} success="Rol creado." resetOnSuccess className="flex flex-col gap-5">
          <Field label="Nombre">
            <div className="max-w-sm">
              <Input type="text" name="name" required placeholder="Ej: Recepción" />
            </div>
          </Field>
          <PermGrid perms={permissions} checked={new Set()} />
          <div>
            <SubmitButton icon="add">Crear rol</SubmitButton>
          </div>
        </ActionForm>
      </Card>
    </>
  );
}

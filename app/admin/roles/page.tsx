import AdminShell from "@/components/admin/AdminShell";
import { memberService } from "@/src/composition";
import { requirePermission } from "@/src/infrastructure/auth/require-admin";
import { createRoleAction, deleteRoleAction, setRolePermissionsAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Roles — Admin", robots: { index: false } };

const inputCls =
  "w-full border hairline bg-ink px-4 py-3 font-mono text-sm text-bone outline-none transition-colors hover:border-gold focus-visible:border-gold";

export default async function RolesPage() {
  await requirePermission("roles.manage");
  const svc = memberService();
  const [roles, permissions] = await Promise.all([svc.listRolesWithPermissions(), svc.listPermissions()]);

  return (
    <AdminShell>
      <h2 className="font-display text-2xl text-bone">Roles</h2>
      <p className="label-sm mt-1 text-bone-mute">
        Define qué puede hacer cada rol. Super admin tiene todos los permisos siempre.
      </p>

      <div className="mt-6 space-y-4">
        {roles.map((role) => {
          const isSuper = role.key === "super_admin";
          return (
            <form
              key={role.id}
              action={setRolePermissionsAction}
              className="border hairline p-5"
            >
              <input type="hidden" name="roleId" value={role.id} />
              <div className="flex items-center justify-between">
                <h3 className="font-display text-lg text-bone">{role.name}</h3>
                {role.isSystem ? (
                  <span className="label-sm text-bone-mute">sistema</span>
                ) : (
                  <span className="flex gap-4">
                    <button type="submit" className="label-sm text-gold">
                      guardar
                    </button>
                    <button formAction={deleteRoleAction} className="label-sm text-sirena">
                      eliminar
                    </button>
                  </span>
                )}
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {permissions.map((p) => {
                  const checked = isSuper || role.permissions.includes(p.key);
                  return (
                    <label key={p.key} className="label-sm flex items-center gap-2 text-bone-dim">
                      <input
                        type="checkbox"
                        name="permissions"
                        value={p.key}
                        defaultChecked={checked}
                        disabled={isSuper}
                        className="accent-gold"
                      />
                      {p.label}
                    </label>
                  );
                })}
              </div>
            </form>
          );
        })}
      </div>

      <h3 className="label mt-10 text-bone-mute">Nuevo rol</h3>
      <form action={createRoleAction} className="mt-3 border hairline p-5">
        <label className="label-sm text-bone-mute">
          Nombre
          <input type="text" name="name" required placeholder="Ej: Recepción" className={`${inputCls} mt-1 max-w-sm`} />
        </label>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {permissions.map((p) => (
            <label key={p.key} className="label-sm flex items-center gap-2 text-bone-dim">
              <input type="checkbox" name="permissions" value={p.key} className="accent-gold" />
              {p.label}
            </label>
          ))}
        </div>
        <button type="submit" className="mt-4 inline-flex bg-gold px-5 py-3 label text-ink">
          Crear rol
        </button>
      </form>
    </AdminShell>
  );
}

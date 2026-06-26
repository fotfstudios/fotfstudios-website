import AdminShell from "@/components/admin/AdminShell";
import { fmtDateTime } from "@/components/admin/format";
import { memberService } from "@/src/composition";
import { requirePermission } from "@/src/infrastructure/auth/require-admin";
import { inviteMemberAction, setMemberRoleAction, setMemberStatusAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Miembros — Admin", robots: { index: false } };

const inputCls =
  "w-full border hairline bg-ink px-4 py-3 font-mono text-sm text-bone outline-none transition-colors hover:border-gold focus-visible:border-gold";

export default async function MiembrosPage() {
  await requirePermission("members.manage");
  const svc = memberService();
  const [members, roles] = await Promise.all([svc.listMembers(), svc.listRoles()]);

  return (
    <AdminShell>
      <h2 className="font-display text-2xl text-bone">Miembros</h2>
      <p className="label-sm mt-1 text-bone-mute">
        Invita por correo: Supabase le envía el enlace de acceso. Solo invitados pueden entrar.
      </p>

      <form action={inviteMemberAction} className="mt-6 flex max-w-2xl flex-wrap items-end gap-3">
        <label className="label-sm flex-1 text-bone-mute">
          Correo
          <input type="email" name="email" required placeholder="persona@correo.cl" className={inputCls} />
        </label>
        <label className="label-sm text-bone-mute">
          Rol
          <select name="roleId" required className={inputCls} defaultValue="">
            <option value="" disabled>
              Elegir…
            </option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="inline-flex bg-gold px-5 py-3 label text-ink">
          Invitar
        </button>
      </form>

      <h3 className="label mt-10 text-bone-mute">Miembros</h3>
      <table className="mt-3 w-full text-sm">
        <tbody>
          {members.map((m) => (
            <tr key={m.id} className="border-b hairline align-middle">
              <td className="py-3 font-mono text-bone">{m.email}</td>
              <td className="py-3">
                <form action={setMemberRoleAction} className="flex items-center gap-2">
                  <input type="hidden" name="memberId" value={m.id} />
                  <select name="roleId" defaultValue={m.roleId} className={`${inputCls} py-2`}>
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                  <button type="submit" className="label-sm text-gold">
                    guardar
                  </button>
                </form>
              </td>
              <td className="py-3">
                <span className={`label-sm ${m.status === "active" ? "text-gold" : "text-bone-mute"}`}>
                  {m.status}
                </span>
              </td>
              <td className="py-3 text-bone-mute font-mono text-xs">{fmtDateTime(m.createdAt)}</td>
              <td className="py-3 text-right">
                <form action={setMemberStatusAction}>
                  <input type="hidden" name="memberId" value={m.id} />
                  <input type="hidden" name="status" value={m.status === "active" ? "disabled" : "active"} />
                  <button type="submit" className={`label-sm ${m.status === "active" ? "text-sirena" : "text-gold"}`}>
                    {m.status === "active" ? "desactivar" : "reactivar"}
                  </button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="mt-4 label-sm text-bone-mute">
        Un cambio de rol se aplica cuando el miembro vuelve a iniciar sesión (el acceso viaja en su token).
      </p>
    </AdminShell>
  );
}

import { fmtDateTime } from "@/components/admin/format";
import { ActionForm } from "@/components/admin/ui/ActionForm";
import { ConfirmForm } from "@/components/admin/ui/ConfirmForm";
import { DataTable, Td, Th, Tr } from "@/components/admin/ui/DataTable";
import { EmptyState } from "@/components/admin/ui/EmptyState";
import { Select } from "@/components/admin/ui/Field";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { StatusPill } from "@/components/admin/ui/StatusPill";
import { SubmitButton } from "@/components/admin/ui/SubmitButton";
import { memberService } from "@/src/composition";
import { requirePermission } from "@/src/infrastructure/auth/require-admin";
import { setMemberRoleAction, setMemberStatusAction } from "./actions";
import { InviteMemberButton } from "./_components/InviteMemberButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Miembros — Admin", robots: { index: false } };

export default async function MiembrosPage() {
  await requirePermission("members.manage");
  const svc = memberService();
  const [members, roles] = await Promise.all([svc.listMembers(), svc.listRoles()]);

  return (
    <>
      <PageHeader
        kicker="Configuración"
        title="Miembros"
        editorial="Quién entra al panel, y con qué rol."
        action={<InviteMemberButton roles={roles} />}
      />

      <div className="mt-8">
        {members.length === 0 ? (
          <EmptyState
            icon="members"
            title="Aún no hay miembros"
            hint="Invita a tu equipo por correo. Cada persona entra con un enlace y el rol que le asignes."
          />
        ) : (
          <DataTable
            head={
              <>
                <Th>Correo</Th>
                <Th>Rol</Th>
                <Th>Estado</Th>
                <Th>Desde</Th>
                <Th right>Acciones</Th>
              </>
            }
          >
            {members.map((m) => (
              <Tr key={m.id}>
                <Td className="font-mono text-bone">{m.email}</Td>
                <Td>
                  <ActionForm action={setMemberRoleAction} success="Rol actualizado." className="flex items-center gap-2">
                    <input type="hidden" name="memberId" value={m.id} />
                    <div className="w-40">
                      <Select name="roleId" defaultValue={m.roleId}>
                        {roles.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <SubmitButton variant="ghost" size="sm">
                      Guardar
                    </SubmitButton>
                  </ActionForm>
                </Td>
                <Td>
                  <StatusPill status={m.status} />
                </Td>
                <Td className="whitespace-nowrap font-mono text-xs text-bone-mute">{fmtDateTime(m.createdAt)}</Td>
                <Td right>
                  {m.status === "active" ? (
                    <ConfirmForm
                      action={setMemberStatusAction}
                      hidden={{ memberId: m.id, status: "disabled" }}
                      trigger={{ label: "Desactivar", variant: "ghost", size: "sm" }}
                      title="Desactivar miembro"
                      message={`${m.email} dejará de tener acceso al panel. Puedes reactivarlo cuando quieras.`}
                      cta="Desactivar"
                      success="Miembro desactivado."
                    />
                  ) : (
                    <ActionForm action={setMemberStatusAction} success="Miembro reactivado." className="inline">
                      <input type="hidden" name="memberId" value={m.id} />
                      <input type="hidden" name="status" value="active" />
                      <SubmitButton variant="ghost" size="sm">
                        Reactivar
                      </SubmitButton>
                    </ActionForm>
                  )}
                </Td>
              </Tr>
            ))}
          </DataTable>
        )}
      </div>

      <p className="mt-4 text-xs text-bone-mute">
        Un cambio de rol se aplica cuando el miembro vuelve a iniciar sesión.
      </p>
    </>
  );
}

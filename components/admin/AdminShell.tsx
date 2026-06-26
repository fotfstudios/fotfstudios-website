import Link from "next/link";
import { hasPermission } from "@/src/domain/auth/permissions";
import { currentClaims } from "@/src/infrastructure/auth/require-admin";
import SignOutButton from "./SignOutButton";

export default async function AdminShell({ children }: { children: React.ReactNode }) {
  const claims = await currentClaims();
  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="flex items-center justify-between border-b hairline pb-4">
        <div className="flex items-center gap-6">
          <span className="font-display text-xl text-gold">FOTF · Admin</span>
          <nav className="flex gap-4 label-sm text-bone-mute">
            <Link href="/admin" className="transition-colors hover:text-gold">
              Hoy
            </Link>
            <Link href="/admin/reservas" className="transition-colors hover:text-gold">
              Reservas
            </Link>
            <Link href="/admin/reservas/nueva" className="transition-colors hover:text-gold">
              Nueva
            </Link>
            <Link href="/admin/bloqueos" className="transition-colors hover:text-gold">
              Bloqueos
            </Link>
            {hasPermission(claims, "members.manage") && (
              <Link href="/admin/miembros" className="transition-colors hover:text-gold">
                Miembros
              </Link>
            )}
            {hasPermission(claims, "roles.manage") && (
              <Link href="/admin/roles" className="transition-colors hover:text-gold">
                Roles
              </Link>
            )}
          </nav>
        </div>
        <SignOutButton />
      </header>
      <div className="mt-8">{children}</div>
    </div>
  );
}

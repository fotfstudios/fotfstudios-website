import type { ReactNode } from "react";
import { hasPermission } from "@/src/domain/auth/permissions";
import { currentClaims } from "@/src/infrastructure/auth/require-admin";
import { adminRepository } from "@/src/composition";
import { Sidebar } from "./ui/Sidebar";
import { Toaster } from "./ui/Toaster";

/** Shell del admin: sidebar persistente (nav por permiso + badge de pendientes) + toaster. */
export default async function AdminShell({ children }: { children: ReactNode }) {
  const [claims, porHacer] = await Promise.all([currentClaims(), adminRepository().porHacerCount()]);
  const show = {
    members: hasPermission(claims, "members.manage"),
    roles: hasPermission(claims, "roles.manage"),
  };
  return (
    <Toaster>
      <Sidebar show={show} porHacer={porHacer} />
      <main className="min-h-screen lg:pl-60">
        <div className="booth-glow">
          <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-12">{children}</div>
        </div>
      </main>
    </Toaster>
  );
}

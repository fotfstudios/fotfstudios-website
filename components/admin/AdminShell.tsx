import type { ReactNode } from "react";
import { hasPermission } from "@/src/domain/auth/permissions";
import { currentClaims } from "@/src/infrastructure/auth/require-admin";
import { adminRepository, courseRepository } from "@/src/composition";
import { Sidebar } from "./ui/Sidebar";
import { Toaster } from "./ui/Toaster";

/** Shell del admin: sidebar persistente (nav por permiso + badge de pendientes) + toaster. */
export default async function AdminShell({ children }: { children: ReactNode }) {
  const [claims, porHacer, solicitudes, pendientesSii] = await Promise.all([
    currentClaims(),
    adminRepository().porHacerCount(),
    // Falla suave: un problema contando el badge no puede tumbar el panel entero.
    courseRepository().nuevasCount().catch(() => 0),
    adminRepository().pendingTaxDocsSummary().then((s) => s.count).catch(() => 0),
  ]);
  const show = {
    members: hasPermission(claims, "members.manage"),
    roles: hasPermission(claims, "roles.manage"),
    analytics: hasPermission(claims, "analytics.view"),
    applications: hasPermission(claims, "applications.manage"),
    course: hasPermission(claims, "course.manage"),
    customers: hasPermission(claims, "customers.manage"),
    lock: hasPermission(claims, "reservations.access"),
    sii: hasPermission(claims, "reservations.boleta"),
    equipment: hasPermission(claims, "equipment.manage"),
  };
  return (
    <Toaster>
      {/* data-surface="tool": sube un paso la escala de .label/.label-sm (globals.css) en
          todo el panel, sidebar incluido. `contents` no añade caja al layout. */}
      <div data-surface="tool" className="contents">
        <Sidebar show={show} porHacer={porHacer} solicitudes={solicitudes} pendientesSii={pendientesSii} />
        <main className="min-h-screen lg:pl-60">
          <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-12">{children}</div>
        </main>
      </div>
    </Toaster>
  );
}

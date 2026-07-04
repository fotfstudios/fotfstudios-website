"use client";

import { useRouter } from "next/navigation";
import { createAuthBrowserClient } from "@/src/infrastructure/auth/browser";
import { Icon } from "./ui/icons";

/** Cierra la sesión y vuelve al login del área (`redirectTo`). */
export default function SignOutButton({
  redirectTo = "/admin/login",
  className = "flex w-full items-center gap-3 px-3 py-2.5 label text-bone-mute transition-colors hover:text-gold",
  label = "Salir",
}: {
  redirectTo?: string;
  className?: string;
  label?: string;
}) {
  const router = useRouter();
  const out = async () => {
    await createAuthBrowserClient().auth.signOut();
    router.replace(redirectTo);
    router.refresh();
  };
  return (
    <button type="button" onClick={out} className={className}>
      <Icon name="logout" size={17} />
      {label}
    </button>
  );
}

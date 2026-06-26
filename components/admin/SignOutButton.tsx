"use client";

import { useRouter } from "next/navigation";
import { createAuthBrowserClient } from "@/src/infrastructure/auth/browser";

export default function SignOutButton() {
  const router = useRouter();
  const out = async () => {
    await createAuthBrowserClient().auth.signOut();
    router.replace("/admin/login");
    router.refresh();
  };
  return (
    <button type="button" onClick={out} className="label-sm text-bone-mute transition-colors hover:text-gold">
      Salir
    </button>
  );
}

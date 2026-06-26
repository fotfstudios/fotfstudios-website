"use client";

import { useRouter } from "next/navigation";
import { createAuthBrowserClient } from "@/src/infrastructure/auth/browser";
import { Icon } from "./ui/icons";

export default function SignOutButton() {
  const router = useRouter();
  const out = async () => {
    await createAuthBrowserClient().auth.signOut();
    router.replace("/admin/login");
    router.refresh();
  };
  return (
    <button
      type="button"
      onClick={out}
      className="flex w-full items-center gap-3 px-3 py-2.5 label text-bone-mute transition-colors hover:text-gold"
    >
      <Icon name="logout" size={17} />
      Salir
    </button>
  );
}

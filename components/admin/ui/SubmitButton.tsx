"use client";

import { useFormStatus } from "react-dom";
import { Icon, type IconName } from "./icons";
import { btn, type BtnSize, type BtnVariant } from "./styles";

/** Botón de submit con estado pending (spinner + disabled) vía useFormStatus. */
export function SubmitButton({
  children,
  variant = "primary",
  size = "md",
  icon,
  pendingLabel,
}: {
  children: React.ReactNode;
  variant?: BtnVariant;
  size?: BtnSize;
  icon?: IconName;
  pendingLabel?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={btn(variant, size)}>
      {pending ? (
        <>
          <span
            className="h-3.5 w-3.5 animate-spin rounded-full border border-current border-t-transparent"
            aria-hidden="true"
          />
          {pendingLabel ?? children}
        </>
      ) : (
        <>
          {icon && <Icon name={icon} size={size === "sm" ? 14 : 16} />}
          {children}
        </>
      )}
    </button>
  );
}

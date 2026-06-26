import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { Icon, type IconName } from "./icons";
import { btn, type BtnSize, type BtnVariant } from "./styles";

type Common = { variant?: BtnVariant; size?: BtnSize; icon?: IconName; children: ReactNode };

/** Botón/enlace con las variantes de marca. Para onClick usa un client component con btn(). */
export function Button({
  href,
  variant = "primary",
  size = "md",
  icon,
  children,
  ...rest
}: Common & { href?: string } & ComponentProps<"button">) {
  const cls = btn(variant, size);
  const inner = (
    <>
      {icon && <Icon name={icon} size={size === "sm" ? 14 : 16} />}
      {children}
    </>
  );
  if (href) {
    return (
      <Link href={href} className={cls}>
        {inner}
      </Link>
    );
  }
  return (
    <button className={cls} {...rest}>
      {inner}
    </button>
  );
}

import type { ReactNode } from "react";
import { Icon, type IconName } from "./icons";

/** Pantalla vacía: invitación a actuar, no relleno. */
export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon?: IconName;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center border hairline px-6 py-16 text-center">
      {icon && (
        <span className="flex h-12 w-12 items-center justify-center border hairline text-bone-mute">
          <Icon name={icon} size={22} />
        </span>
      )}
      <p className="font-display mt-4 text-2xl text-bone">{title}</p>
      {hint && <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-bone-dim">{hint}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

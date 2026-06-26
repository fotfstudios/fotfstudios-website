/** Íconos de línea del admin: trazo fino (1.6), currentColor, sin relleno. */
import type { SVGProps } from "react";

const PATHS = {
  today: "M8 2v3M16 2v3M3.5 8.5h17M5 5.5h14a1.5 1.5 0 0 1 1.5 1.5v12A1.5 1.5 0 0 1 19 20.5H5A1.5 1.5 0 0 1 3.5 19V7A1.5 1.5 0 0 1 5 5.5ZM12 12.5v4M9.5 14.5h5",
  bookings: "M4 6h16M4 12h16M4 18h10",
  add: "M12 5v14M5 12h14",
  block: "M5.5 5.5l13 13M19 12a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z",
  members: "M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19M10 10.5a3.25 3.25 0 1 0 0-6.5 3.25 3.25 0 0 0 0 6.5ZM20 19v-1.5a3.5 3.5 0 0 0-2.6-3.4M15.5 4.2a3.25 3.25 0 0 1 0 6.1",
  roles: "M12 3l7 3v5c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6l7-3ZM9.5 12l1.8 1.8L15 10.5",
  chevron: "M9 6l6 6-6 6",
  check: "M5 12.5l4.5 4.5L19 8",
  alert: "M12 8v5M12 16.5v.5M10.3 4l-7 12A1.5 1.5 0 0 0 4.6 18.5h14.8A1.5 1.5 0 0 0 20.7 16l-7-12a1.5 1.5 0 0 0-2.6 0Z",
  close: "M6 6l12 12M18 6L6 18",
  logout: "M14 8V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v12A1.5 1.5 0 0 0 6 19.5h6.5A1.5 1.5 0 0 0 14 18v-2M9.5 12h11M17 8.5l3.5 3.5L17 15.5",
  menu: "M4 7h16M4 12h16M4 17h16",
  whatsapp:
    "M12 4.5a7.5 7.5 0 0 0-6.4 11.4L4.5 19.5l3.7-1.1A7.5 7.5 0 1 0 12 4.5ZM9.4 8.6c.2 0 .4 0 .5.4l.6 1.4c.1.2 0 .4-.1.5l-.4.5c-.1.1-.2.3 0 .5a5 5 0 0 0 2.1 2c.2.1.4.1.5 0l.5-.6c.1-.2.3-.2.5-.1l1.4.7c.2.1.3.3.2.5-.2.8-1 1.3-1.7 1.3-2.6 0-5.4-2.8-5.4-5.4 0-.7.5-1.5 1.3-1.6Z",
  doc: "M7 3.5h7L18.5 8v11.5A1 1 0 0 1 17.5 20.5h-11A1 1 0 0 1 5.5 19.5V4.5A1 1 0 0 1 6.5 3.5ZM13.5 3.5V8.5H18.5M8.5 12.5h7M8.5 15.5h7",
  clock: "M12 7.5V12l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18, ...rest }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

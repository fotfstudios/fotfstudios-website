/**
 * Qué horas de inicio se pueden elegir de verdad en un día, para una duración dada.
 * Puro (sin IO) para que vitest lo cubra; lo pinta `components/admin/SlotPicker.tsx`
 * con la ocupación real del día.
 *
 * Mismo criterio que la consola de reserva manual: si el inicio cae dentro de algo
 * ya agendado está "ocupado" (o "bloqueo"); si empieza libre pero la duración choca
 * más adelante, "no alcanza". Fuera del horario de apertura se permite con aviso:
 * el curso y la práctica no se venden en /reservar, el dueño decide.
 */
import { overlaps } from "@/src/domain/scheduling/availability";

const DAY_END = 24 * 60;
/** Ventana con la que se mira el inicio: una media hora, el paso del selector. */
const STEP = 30;

export type SlotTag = "ocupado" | "bloqueo" | "curso" | "no alcanza" | "pasado" | "fuera de horario" | null;

export interface PickerSlot {
  minute: number;
  tag: SlotTag;
  disabled: boolean;
}

export interface PickerInput {
  /** Inicios a evaluar (minutos del día). */
  starts: number[];
  durationMin: number;
  /** Lo que ya ocupa la sala ese día (minutos locales). */
  occupancy: { id: string; start: number; end: number; kind: string }[];
  /** Reserva a ignorar: la propia sesión cuando se la está moviendo. */
  ignoreId?: string;
  open: number;
  close: number;
  closed: boolean;
  /** El día completo ya pasó. */
  dayIsPast: boolean;
  isToday: boolean;
  /** Minuto actual en la zona de la sala (solo cuenta si `isToday`). */
  nowMinute: number;
}

export function pickerSlots(input: PickerInput): PickerSlot[] {
  const busy = input.occupancy.filter((o) => o.id !== input.ignoreId);
  return input.starts.map((minute) => {
    const head = { start: minute, end: minute + STEP };
    const full = { start: minute, end: minute + input.durationMin };

    const headHits = busy.filter((o) => overlaps(head, o));
    if (headHits.length > 0) {
      // Lo más específico gana: un bloqueo de mantención, luego una sesión de curso.
      const tag: SlotTag = headHits.some((o) => o.kind === "block")
        ? "bloqueo"
        : headHits.some((o) => o.kind === "curso")
          ? "curso"
          : "ocupado";
      return { minute, tag, disabled: true };
    }
    if (full.end > DAY_END || busy.some((o) => overlaps(full, o))) {
      return { minute, tag: "no alcanza", disabled: true };
    }
    if (input.dayIsPast || (input.isToday && minute <= input.nowMinute)) {
      return { minute, tag: "pasado", disabled: true };
    }
    const inHours = !input.closed && minute >= input.open && full.end <= input.close;
    return { minute, tag: inHours ? null : "fuera de horario", disabled: false };
  });
}

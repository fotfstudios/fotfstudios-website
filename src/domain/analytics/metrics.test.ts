import { describe, expect, it } from "vitest";
import {
  computeAnalytics,
  type AnalyticsLineRow,
  type AnalyticsReservationRow,
} from "./metrics";

const TZ = "America/Santiago";

/** Reserva de sesión pagada online por defecto; override lo que necesites. */
function mkRes(
  over: Partial<Omit<AnalyticsReservationRow, "order">> & {
    startsAt: string;
    endsAt: string;
    order?: Partial<AnalyticsReservationRow["order"]> | null;
  },
): AnalyticsReservationRow {
  const { order: orderOver, ...rest } = over;
  const order =
    orderOver === null
      ? null
      : {
          id: `o-${over.startsAt}`,
          status: "paid",
          amountClp: 9990,
          refundedAmountClp: 0,
          createdAt: "2026-07-01T12:00:00Z",
          mpPaymentId: "123",
          customerEmail: "a@e.cl",
          feeAmount: null,
          ...(orderOver ?? {}),
        };
  return { kind: "booking", status: "confirmed", ...rest, order } as AnalyticsReservationRow;
}

// Semana local de referencia: lunes 2026-07-06 … domingo 2026-07-12 (invierno, UTC-4).
const DATES = ["2026-07-06", "2026-07-07", "2026-07-08", "2026-07-09", "2026-07-10", "2026-07-11", "2026-07-12"];
// Horario seed: Dom-Jue 09:00-22:00 (780 min), Vie/Sáb 09:00-23:00 (840 min).
const HOURS = [0, 1, 2, 3, 4].map((w) => ({ weekday: w, openMinute: 540, closeMinute: 1320 }))
  .concat([5, 6].map((w) => ({ weekday: w, openMinute: 540, closeMinute: 1380 })));

const BASE = {
  prevRows: [] as AnalyticsReservationRow[],
  lines: [] as AnalyticsLineRow[],
  dates: DATES,
  prevDates: [] as string[],
  tz: TZ,
  bucket: "day" as const,
  openingHours: HOURS,
  exceptions: [],
  priorCustomerEmails: new Set<string>(),
};

// 18:00 local = 22:00Z en invierno chileno (UTC-4).
const local = (date: string, h: number) => `${date}T${String(h).padStart(2, "0")}:00:00-04:00`;

describe("computeAnalytics — ingresos", () => {
  it("suma neto de reembolsos, atribuye por fecha de sesión y bucketiza por día", () => {
    const rows = [
      mkRes({ startsAt: local("2026-07-06", 18), endsAt: local("2026-07-06", 20), order: { id: "o1", amountClp: 19980 } as never }),
      mkRes({
        startsAt: local("2026-07-08", 10),
        endsAt: local("2026-07-08", 11),
        status: "cancelled",
        order: { id: "o2", status: "refunded", amountClp: 9990, refundedAmountClp: 4990 } as never,
      }),
    ];
    const s = computeAnalytics({ ...BASE, rows });
    expect(s.revenue.total).toBe(19980 + (9990 - 4990));
    expect(s.revenue.refundedTotal).toBe(4990);
    expect(s.revenue.buckets).toHaveLength(7);
    expect(s.revenue.buckets[0].value).toBe(19980); // lunes 6
    expect(s.revenue.buckets[2].value).toBe(5000); // miércoles 8
    expect(s.revenue.buckets[1].value).toBe(0);
  });

  it("delta vs período anterior; período anterior vacío → delta null", () => {
    const rows = [mkRes({ startsAt: local("2026-07-06", 18), endsAt: local("2026-07-06", 19) })];
    const prev = [
      mkRes({ startsAt: local("2026-06-29", 18), endsAt: local("2026-06-29", 19), order: { id: "p1", amountClp: 19980 } as never }),
    ];
    const withPrev = computeAnalytics({ ...BASE, rows, prevRows: prev, prevDates: ["2026-06-29"] });
    expect(withPrev.revenue.prevTotal).toBe(19980);
    expect(withPrev.revenue.deltaPct).toBeCloseTo(-50, 5); // 9990 vs 19980
    const noPrev = computeAnalytics({ ...BASE, rows });
    expect(noPrev.revenue.deltaPct).toBeNull();
  });

  it("comisiones MP: solo donde hay snapshot (fee)", () => {
    const rows = [
      mkRes({ startsAt: local("2026-07-06", 18), endsAt: local("2026-07-06", 19), order: { id: "o1", feeAmount: 590 } as never }),
      mkRes({ startsAt: local("2026-07-07", 18), endsAt: local("2026-07-07", 19), order: { id: "o2", mpPaymentId: "offline:efectivo" } as never }),
    ];
    expect(computeAnalytics({ ...BASE, rows }).revenue.mpFees).toBe(590);
  });
});

describe("computeAnalytics — ocupación", () => {
  it("porcentaje sobre minutos abiertos reales y por día de semana", () => {
    // 2h confirmadas el lunes (780 min abiertos) → lunes 15.4%; total semana 120/5400.
    const rows = [mkRes({ startsAt: local("2026-07-06", 18), endsAt: local("2026-07-06", 20) })];
    const s = computeAnalytics({ ...BASE, rows });
    const openWeek = 780 * 5 + 840 * 2; // Lun-Jue + Dom (5×780) + Vie/Sáb (2×840) = 5580
    expect(s.occupancy.pct).toBeCloseTo((120 / openWeek) * 100, 1);
    const monday = s.occupancy.byWeekday.find((d) => d.label === "Lun")!;
    expect(monday.pct).toBeCloseTo((120 / 780) * 100, 1);
  });

  it("excepciones: día cerrado sale del denominador; override ajusta horas", () => {
    const rows: AnalyticsReservationRow[] = [];
    const closed = computeAnalytics({
      ...BASE,
      rows,
      exceptions: [{ date: "2026-07-06", closed: true, openMinute: null, closeMinute: null }],
    });
    const override = computeAnalytics({
      ...BASE,
      rows,
      exceptions: [{ date: "2026-07-06", closed: false, openMinute: 600, closeMinute: 900 }],
    });
    // denominadores: base 5580; lunes cerrado → 4800; override lunes 300 min → 5100
    expect(closed.occupancy.openMinutes).toBe(5580 - 780);
    expect(override.occupancy.openMinutes).toBe(5580 - 780 + 300);
  });

  it("los bloqueos no cuentan como ocupación y lo reservado se recorta al horario", () => {
    const rows = [
      mkRes({ kind: "block", status: "confirmed", startsAt: local("2026-07-06", 10), endsAt: local("2026-07-06", 12), order: null as never }),
      // 08:00-10:00 pero abre 09:00 → solo 60 min cuentan
      mkRes({ startsAt: local("2026-07-07", 8), endsAt: local("2026-07-07", 10) }),
    ];
    const s = computeAnalytics({ ...BASE, rows });
    expect(s.occupancy.bookedMinutes).toBe(60);
  });
});

describe("computeAnalytics — embudo y add-ons", () => {
  it("clasifica online/offline/cortesía/cancelada/reembolsada/hold vencido", () => {
    const rows = [
      mkRes({ startsAt: local("2026-07-06", 10), endsAt: local("2026-07-06", 11) }), // online
      mkRes({ startsAt: local("2026-07-06", 12), endsAt: local("2026-07-06", 13), order: { id: "o2", mpPaymentId: "offline:efectivo" } as never }),
      mkRes({ startsAt: local("2026-07-06", 14), endsAt: local("2026-07-06", 15), order: null as never }), // cortesía
      mkRes({ startsAt: local("2026-07-07", 10), endsAt: local("2026-07-07", 11), status: "cancelled", order: { id: "o4", status: "paid" } as never }),
      mkRes({ startsAt: local("2026-07-07", 12), endsAt: local("2026-07-07", 13), status: "cancelled", order: { id: "o5", status: "refunded", refundedAmountClp: 9990 } as never }),
      mkRes({ startsAt: local("2026-07-07", 14), endsAt: local("2026-07-07", 15), status: "expired", order: { id: "o6", status: "pending_payment" } as never }),
      mkRes({ kind: "block", startsAt: local("2026-07-08", 10), endsAt: local("2026-07-08", 12), order: null as never }),
    ];
    const f = computeAnalytics({ ...BASE, rows }).funnel;
    expect(f).toEqual({ online: 1, offline: 1, courtesy: 1, cancelled: 1, refunded: 1, expiredHolds: 1 });
  });

  it("attach rate por addon_key sobre sesiones pagadas", () => {
    const rows = [
      mkRes({ startsAt: local("2026-07-06", 10), endsAt: local("2026-07-06", 11), order: { id: "oa" } as never }),
      mkRes({ startsAt: local("2026-07-06", 12), endsAt: local("2026-07-06", 13), order: { id: "ob" } as never }),
    ];
    const lines: AnalyticsLineRow[] = [
      { orderId: "oa", lineType: "flat_service", addonKey: "audio", description: "Grabación de audio", subtotalClp: 9990 },
      { orderId: "oa", lineType: "room_time", addonKey: null, description: "Sala · 1h", subtotalClp: 9990 },
    ];
    const s = computeAnalytics({ ...BASE, rows, lines });
    expect(s.addons).toEqual([
      { key: "audio", label: "Grabación de audio", count: 1, attachPct: 50 },
    ]);
  });
});

describe("computeAnalytics — clientes", () => {
  it("nuevos vs recurrentes (emails previos) y top por ingresos", () => {
    const rows = [
      mkRes({ startsAt: local("2026-07-06", 10), endsAt: local("2026-07-06", 11), order: { id: "o1", customerEmail: "ana@e.cl", amountClp: 30000 } as never }),
      mkRes({ startsAt: local("2026-07-07", 10), endsAt: local("2026-07-07", 11), order: { id: "o2", customerEmail: "Ana@e.cl", amountClp: 10000 } as never }),
      mkRes({ startsAt: local("2026-07-08", 10), endsAt: local("2026-07-08", 11), order: { id: "o3", customerEmail: "beto@e.cl", amountClp: 5000 } as never }),
    ];
    const s = computeAnalytics({ ...BASE, rows, priorCustomerEmails: new Set(["beto@e.cl"]) });
    expect(s.customers.new).toBe(1); // ana (case-insensitive, única)
    expect(s.customers.returning).toBe(1); // beto
    expect(s.customers.top[0]).toEqual({ email: "ana@e.cl", sessions: 2, revenue: 40000 });
  });

  it("lead time mediano en horas (cuenta par → promedio de centrales)", () => {
    const rows = [
      // created 2026-07-01T12:00Z; sesión lunes 18:00 local (22:00Z) → 130h; martes → 154h
      mkRes({ startsAt: local("2026-07-06", 18), endsAt: local("2026-07-06", 19) }),
      mkRes({ startsAt: local("2026-07-07", 18), endsAt: local("2026-07-07", 19), order: { id: "o2" } as never }),
    ];
    const s = computeAnalytics({ ...BASE, rows });
    expect(s.customers.leadTimeMedianHours).toBeCloseTo((130 + 154) / 2, 0);
  });
});

describe("computeAnalytics — buckets semanales", () => {
  it("bucket=week agrupa por semana local (lunes)", () => {
    const dates: string[] = [];
    for (let i = 0; i < 14; i++) {
      dates.push(`2026-07-${String(6 + i).padStart(2, "0")}`);
    }
    const rows = [
      mkRes({ startsAt: local("2026-07-06", 18), endsAt: local("2026-07-06", 19) }),
      mkRes({ startsAt: local("2026-07-15", 18), endsAt: local("2026-07-15", 19), order: { id: "o2" } as never }),
    ];
    const s = computeAnalytics({ ...BASE, rows, dates, bucket: "week" });
    expect(s.revenue.buckets).toHaveLength(2);
    expect(s.revenue.buckets[0].value).toBe(9990);
    expect(s.revenue.buckets[1].value).toBe(9990);
  });
});

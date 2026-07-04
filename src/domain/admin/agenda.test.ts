import { describe, expect, it } from "vitest";
import { toLocalMinutesInterval } from "@/src/domain/scheduling/time";
import {
  agendaHref,
  agendaRange,
  assignLanes,
  axisWindow,
  chipSplit,
  effectiveHours,
  eventsByDay,
  gridOrder,
  parseAgendaSearchParams,
  rangeLabel,
  shiftAnchor,
  wallMinutes,
  type AgendaQuery,
} from "./agenda";

const TZ = "America/Santiago";
const TODAY = "2026-07-03"; // viernes

/** Instante UTC ISO de una fecha local + hora en Santiago (invierno: UTC-4). */
const utc = (date: string, hhmm: string) => `${date}T${hhmm}:00.000-04:00`;

describe("parseAgendaSearchParams", () => {
  it("sin params → semana de hoy", () => {
    expect(parseAgendaSearchParams({}, TODAY)).toEqual({ view: "semana", date: TODAY });
  });

  it("valores válidos pasan tal cual", () => {
    expect(parseAgendaSearchParams({ v: "dia", d: "2026-08-15" }, TODAY)).toEqual({
      view: "dia",
      date: "2026-08-15",
    });
    expect(parseAgendaSearchParams({ v: "mes" }, TODAY)).toEqual({ view: "mes", date: TODAY });
  });

  it("basura cae al default", () => {
    expect(parseAgendaSearchParams({ v: "año", d: "garbage" }, TODAY)).toEqual({ view: "semana", date: TODAY });
    expect(parseAgendaSearchParams({ d: "2026-02-31" }, TODAY).date).toBe(TODAY); // fecha inexistente
    expect(parseAgendaSearchParams({ d: "0001-01-01" }, TODAY).date).toBe(TODAY); // fuera de rango sano
    expect(parseAgendaSearchParams({ d: "3000-01-01" }, TODAY).date).toBe(TODAY);
    expect(parseAgendaSearchParams({ v: ["dia", "mes"], d: ["2026-08-15", "x"] }, TODAY)).toEqual({
      view: "dia",
      date: "2026-08-15",
    });
  });

  it("?w= legado se respeta; ?d= le gana", () => {
    expect(parseAgendaSearchParams({ w: "2026-07-06" }, TODAY)).toEqual({ view: "semana", date: "2026-07-06" });
    expect(parseAgendaSearchParams({ w: "2026-07-06", d: "2026-07-10" }, TODAY).date).toBe("2026-07-10");
    expect(parseAgendaSearchParams({ w: "garbage" }, TODAY).date).toBe(TODAY);
  });
});

describe("agendaHref", () => {
  const base: AgendaQuery = { view: "semana", date: TODAY };

  it("omite defaults (v=semana, d=hoy)", () => {
    expect(agendaHref(base, {}, TODAY)).toBe("/admin/agenda");
    expect(agendaHref(base, { view: "dia" }, TODAY)).toBe("/admin/agenda?v=dia");
    expect(agendaHref(base, { date: "2026-07-10" }, TODAY)).toBe("/admin/agenda?d=2026-07-10");
  });

  it("cambiar de vista conserva el ancla; volver a hoy la omite", () => {
    const q: AgendaQuery = { view: "mes", date: "2026-08-15" };
    expect(agendaHref(q, { view: "dia" }, TODAY)).toBe("/admin/agenda?v=dia&d=2026-08-15");
    expect(agendaHref(q, { date: TODAY }, TODAY)).toBe("/admin/agenda?v=mes");
  });
});

describe("shiftAnchor", () => {
  it("día ±1", () => {
    expect(shiftAnchor({ view: "dia", date: "2026-07-31" }, 1)).toBe("2026-08-01");
    expect(shiftAnchor({ view: "dia", date: "2026-07-01" }, -1)).toBe("2026-06-30");
  });

  it("semana ±7 conserva el día de semana", () => {
    expect(shiftAnchor({ view: "semana", date: TODAY }, 1)).toBe("2026-07-10");
    expect(shiftAnchor({ view: "semana", date: TODAY }, -1)).toBe("2026-06-26");
  });

  it("mes clampa el fin de mes", () => {
    expect(shiftAnchor({ view: "mes", date: "2026-01-31" }, 1)).toBe("2026-02-28");
    expect(shiftAnchor({ view: "mes", date: "2026-03-31" }, -1)).toBe("2026-02-28");
  });
});

describe("agendaRange", () => {
  it("día → 1 fecha", () => {
    expect(agendaRange({ view: "dia", date: TODAY }).days).toEqual([TODAY]);
  });

  it("semana → 7 fechas lunes-primero conteniendo el ancla (incluso domingo)", () => {
    const r = agendaRange({ view: "semana", date: "2026-07-05" }); // domingo
    expect(r.days).toHaveLength(7);
    expect(r.days[0]).toBe("2026-06-29"); // lunes
    expect(r.days[6]).toBe("2026-07-05");
    expect(r.days).toContain("2026-07-05");
  });

  it("mes → 42 celdas de monthGrid, con weeks y month", () => {
    const r = agendaRange({ view: "mes", date: "2026-07-15" });
    expect(r.days).toHaveLength(42);
    expect(r.month).toBe("2026-07");
    expect(r.weeks).toHaveLength(6);
    expect(r.days[0]).toBe("2026-06-29"); // lunes de relleno
    expect(r.days).toContain("2026-07-01");
    expect(r.days).toContain("2026-07-31");
  });
});

describe("rangeLabel", () => {
  it("día, semana (mismo mes y cruzando mes) y mes", () => {
    expect(rangeLabel({ view: "dia", date: TODAY })).toBe("Viernes 3 de julio 2026");
    expect(rangeLabel({ view: "semana", date: "2026-07-08" })).toBe("6 – 12 jul 2026");
    expect(rangeLabel({ view: "semana", date: TODAY })).toBe("29 jun – 5 jul 2026");
    expect(rangeLabel({ view: "mes", date: TODAY })).toBe("Julio 2026");
  });
});

describe("eventsByDay", () => {
  const block = { id: "b1", startsAt: utc("2026-07-03", "22:00"), endsAt: utc("2026-07-04", "02:00") };
  const booking = { id: "r1", startsAt: utc("2026-07-03", "19:00"), endsAt: utc("2026-07-03", "21:00") };
  const midnightEnd = { id: "r2", startsAt: utc("2026-07-02", "22:00"), endsAt: utc("2026-07-03", "00:00") };

  it("un bloqueo que cruza medianoche aparece en ambos días", () => {
    const byDay = eventsByDay(["2026-07-03", "2026-07-04"], TZ, [block, booking]);
    expect(byDay["2026-07-03"].map((e) => e.id)).toEqual(["r1", "b1"]);
    expect(byDay["2026-07-04"].map((e) => e.id)).toEqual(["b1"]);
  });

  it("semántica [start, end): terminar a las 00:00 exactas NO cae en el día siguiente", () => {
    const byDay = eventsByDay(["2026-07-02", "2026-07-03"], TZ, [midnightEnd]);
    expect(byDay["2026-07-02"].map((e) => e.id)).toEqual(["r2"]);
    expect(byDay["2026-07-03"]).toEqual([]);
  });

  it("ordena por inicio dentro de cada día", () => {
    const late = { id: "r3", startsAt: utc("2026-07-03", "10:00"), endsAt: utc("2026-07-03", "11:00") };
    const byDay = eventsByDay(["2026-07-03"], TZ, [booking, late]);
    expect(byDay["2026-07-03"].map((e) => e.id)).toEqual(["r3", "r1"]);
  });
});

describe("effectiveHours", () => {
  const hours = [
    { weekday: 5, openMinute: 540, closeMinute: 1380 }, // viernes 09–23
    { weekday: 6, openMinute: 540, closeMinute: 1380 },
  ];

  it("sin excepción usa el horario del día de semana", () => {
    expect(effectiveHours(TODAY, TZ, hours, [])).toEqual([540, 1380]); // 2026-07-03 es viernes
  });

  it("día sin fila de horario → cerrado", () => {
    expect(effectiveHours("2026-07-06", TZ, hours, [])).toBeNull(); // lunes, sin fila
  });

  it("excepción closed anula; excepción con horas pisa el weekday", () => {
    expect(
      effectiveHours(TODAY, TZ, hours, [{ date: TODAY, closed: true, openMinute: null, closeMinute: null }]),
    ).toBeNull();
    expect(
      effectiveHours(TODAY, TZ, hours, [{ date: TODAY, closed: false, openMinute: 600, closeMinute: 720 }]),
    ).toEqual([600, 720]);
  });
});

describe("axisWindow", () => {
  it("sin datos → 09:00–23:00", () => {
    expect(axisWindow([], [])).toEqual({ start: 540, end: 1380 });
    expect(axisWindow([null, null], [])).toEqual({ start: 540, end: 1380 });
  });

  it("unión de horarios de la semana (Dom–Jue 22:00, Vie/Sáb 23:00)", () => {
    expect(axisWindow([[540, 1320], [540, 1380], null], [])).toEqual({ start: 540, end: 1380 });
  });

  it("eventos fuera de horario extienden el eje, alineado a la hora", () => {
    expect(axisWindow([[540, 1320]], [{ start: 0, end: 1440 }])).toEqual({ start: 0, end: 1440 });
    expect(axisWindow([[540, 1320]], [{ start: 490, end: 545 }])).toEqual({ start: 480, end: 1320 });
    expect(axisWindow([[540, 1320]], [{ start: 600, end: 601 }])).toEqual({ start: 540, end: 1320 });
  });

  it("ignora intervalos degenerados (recortes multi-día que quedan vacíos)", () => {
    expect(axisWindow([[540, 1320]], [{ start: 0, end: 0 }, { start: 1440, end: 1440 }])).toEqual({
      start: 540,
      end: 1320,
    });
  });
});

describe("wallMinutes", () => {
  it("minutos de reloj dentro de la columna; clamp fuera del día", () => {
    expect(wallMinutes(utc("2026-07-03", "19:00"), "2026-07-03", TZ)).toBe(1140);
    expect(wallMinutes(utc("2026-07-03", "22:00"), "2026-07-04", TZ)).toBe(0); // empieza el día anterior
    expect(wallMinutes(utc("2026-07-04", "02:00"), "2026-07-03", TZ)).toBe(1440); // termina el día siguiente
  });

  it("DST Santiago: en el día corto (2026-09-06) da minutos de RELOJ donde toLocalMinutesInterval daría −60", () => {
    // 2026-09-06: el reloj salta de 00:00 a 01:00 → las 10:00 de pared son solo 9h transcurridas.
    const tenAm = "2026-09-06T13:00:00.000Z"; // 10:00 en Santiago (UTC-3 tras el cambio)
    expect(wallMinutes(tenAm, "2026-09-06", TZ)).toBe(600);
    const elapsed = toLocalMinutesInterval("2026-09-06", TZ, tenAm, tenAm);
    expect(elapsed.start).toBe(540); // el desalineamiento que wallMinutes evita
  });
});

describe("gridOrder / assignLanes", () => {
  it("bloqueos primero, luego por inicio y por id", () => {
    const events = [
      { id: "r2", kind: "booking", startsAt: utc("2026-07-03", "10:00") },
      { id: "b1", kind: "block", startsAt: utc("2026-07-03", "12:00") },
      { id: "r1", kind: "booking", startsAt: utc("2026-07-03", "10:00") },
    ];
    expect(gridOrder(events).map((e) => e.id)).toEqual(["b1", "r1", "r2"]);
  });

  it("lane = nº de ya-colocados que solapa, con tope 3", () => {
    expect(assignLanes([{ start: 600, end: 720 }, { start: 720, end: 780 }])).toEqual([0, 0]); // bordes no chocan
    expect(assignLanes([{ start: 600, end: 720 }, { start: 660, end: 780 }])).toEqual([0, 1]);
    expect(
      assignLanes([
        { start: 600, end: 900 },
        { start: 600, end: 900 },
        { start: 600, end: 900 },
        { start: 600, end: 900 },
        { start: 600, end: 900 },
      ]),
    ).toEqual([0, 1, 2, 3, 3]);
  });
});

describe("chipSplit", () => {
  it("caben todos → sin overflow; si no, max−1 visibles + resto oculto", () => {
    expect(chipSplit([1, 2, 3], 3)).toEqual({ visible: [1, 2, 3], hiddenCount: 0 });
    expect(chipSplit([1, 2, 3, 4], 3)).toEqual({ visible: [1, 2], hiddenCount: 2 });
    expect(chipSplit([], 3)).toEqual({ visible: [], hiddenCount: 0 });
    const ten = Array.from({ length: 10 }, (_, i) => i);
    expect(chipSplit(ten, 3)).toEqual({ visible: [0, 1], hiddenCount: 8 });
  });
});

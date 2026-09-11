"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/admin/ui/icons";
import { inputCls } from "@/components/admin/ui/styles";
import { fmtPts } from "@/components/cuenta/format";
import { customerLabel } from "@/src/domain/customers/customer-input";
import type { CustomerProfile } from "@/src/application/ports/customers";

/** Espera antes de consultar: suficiente para no disparar por cada tecla. */
const DEBOUNCE_MS = 250;

export interface CustomerPickerProps {
  /** Acción del servidor. Devuelve [] cuando el término es demasiado corto. */
  search: (q: string) => Promise<{ ok: true; data: CustomerProfile[] } | { ok: false; error: string }>;
  onSelect: (c: CustomerProfile) => void;
  /** Abre el alta rápida, con lo tipeado repartido según su forma. */
  onCreateNew: (prefill: { name?: string; email?: string; phone?: string }) => void;
  maxRows?: number;
}

/**
 * Reparte lo que el staff alcanzó a tipear al campo correcto del alta: si trae
 * "@" es un email, si son puros dígitos (8+) es un teléfono, si no es el nombre.
 * Ahorra volver a tipear lo mismo, que es el momento en que la gente abandona.
 */
function prefillFrom(q: string): { name?: string; email?: string; phone?: string } {
  const t = q.trim();
  if (!t) return {};
  if (t.includes("@")) return { email: t };
  if (/^[+\d\s()-]+$/.test(t) && t.replace(/\D/g, "").length >= 8) return { phone: t };
  return { name: t };
}

export function CustomerPicker({ search, onSelect, onCreateNew, maxRows = 6 }: CustomerPickerProps) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<CustomerProfile[]>([]);
  const [state, setState] = useState<"idle" | "searching" | "ready" | "error">("idle");
  const [active, setActive] = useState(0);

  // Contador monotónico: gana SIEMPRE la última búsqueda tipeada, aunque una
  // anterior conteste después (mismo patrón que loadDay en la consola).
  const reqId = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Dirigido por evento, no por effect: el estado lo mueve el tecleo, así que
  // vive en el handler. Un effect sobre `q` obligaría a escribir estado dentro
  // del effect para el caso vacío, que es exactamente lo que el lint prohíbe.
  const run = (term: string) => {
    const id = ++reqId.current;
    setState("searching");
    timer.current = setTimeout(async () => {
      try {
        const res = await search(term);
        if (reqId.current !== id) return;
        if (res.ok) {
          setRows(res.data);
          setState("ready");
          setActive(0);
        } else {
          setState("error");
        }
      } catch {
        if (reqId.current === id) setState("error");
      }
    }, DEBOUNCE_MS);
  };

  const onQueryChange = (value: string) => {
    setQ(value);
    if (timer.current) clearTimeout(timer.current);
    const term = value.trim();
    if (!term) {
      // Una búsqueda en vuelo ya no puede pisar esto: el contador la invalida.
      reqId.current++;
      setRows([]);
      setState("idle");
      return;
    }
    run(term);
  };

  // Un debounce pendiente al desmontar dispararía un setState sobre un
  // componente muerto (la consola cambia de paso apenas se elige una ficha).
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const visible = rows.slice(0, maxRows);
  // El alta rápida es una fila más de la lista: se navega con las flechas igual
  // que un resultado, así "no está" y "créalo" quedan en el mismo gesto.
  const total = visible.length + 1;
  const createIndex = visible.length;

  const choose = (i: number) => {
    if (i === createIndex) onCreateNew(prefillFrom(q));
    else if (visible[i]) onSelect(visible[i]);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % total);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a - 1 + total) % total);
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(active);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onQueryChange("");
    }
  };

  const status =
    state === "idle" && q.trim()
      ? "Escribe al menos 2 letras o 3 dígitos."
      : state === "searching"
        ? "Buscando…"
        : state === "error"
          ? "No se pudo buscar."
          : state === "ready" && visible.length === 0
            ? `Sin coincidencias para “${q.trim()}”.`
            : "";

  return (
    <div>
      <div className="relative">
        <input
          type="text"
          role="combobox"
          aria-expanded={state === "ready"}
          aria-controls="customer-picker-list"
          aria-autocomplete="list"
          aria-activedescendant={state === "ready" ? `customer-opt-${active}` : undefined}
          aria-busy={state === "searching"}
          aria-label="Buscar cliente"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          placeholder="Nombre, email o teléfono…"
          className={`${inputCls} pr-9`}
          value={q}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-bone-mute">
          <Icon name="search" className="h-4 w-4" />
        </span>
      </div>

      {status && (
        <p aria-live="polite" className="mt-2 label-sm text-bone-mute">
          {status}
          {state === "error" && (
            <button type="button" className="ml-2 underline" onClick={() => run(q.trim())}>
              Reintentar
            </button>
          )}
        </p>
      )}

      {q.trim() !== "" && state !== "idle" && (
        <ul id="customer-picker-list" role="listbox" aria-label="Clientes" className="mt-2 border hairline">
          {visible.map((c, i) => (
            <li
              key={c.id}
              id={`customer-opt-${i}`}
              role="option"
              aria-selected={i === active}
              className={`cursor-pointer border-b hairline px-3 py-2 last:border-b-0 ${
                i === active ? "bg-bone/10" : ""
              }`}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(i)}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm text-bone">{customerLabel(c)}</span>
                {c.pointsBalance > 0 && <span className="label-sm text-gold">{fmtPts(c.pointsBalance)} pts</span>}
              </div>
              <div className="flex items-center gap-2 font-mono text-xs text-bone-dim">
                <span className="truncate">{[c.email, c.phone].filter(Boolean).join(" · ") || "Sin contacto"}</span>
                {c.authUserId && <span className="shrink-0 label-sm text-bone-mute">Con cuenta</span>}
              </div>
            </li>
          ))}
          <li
            id={`customer-opt-${createIndex}`}
            role="option"
            aria-selected={active === createIndex}
            className={`cursor-pointer px-3 py-2 ${active === createIndex ? "bg-bone/10" : ""} ${
              visible.length > 0 ? "border-t hairline" : ""
            }`}
            onMouseEnter={() => setActive(createIndex)}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => choose(createIndex)}
          >
            <span className="flex items-center gap-2 text-sm text-gold">
              <Icon name="add" className="h-4 w-4" />
              Nuevo cliente…
            </span>
          </li>
        </ul>
      )}
    </div>
  );
}

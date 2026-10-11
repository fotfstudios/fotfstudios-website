/**
 * Íconos DENTRO del campo (a la derecha) para un dato guardado en la cuenta (nombre, celular)
 * en /reservar: el lápiz desbloquea el campo; ✓ lo guarda en la ficha y ✕ vuelve al valor
 * guardado. Botones de 36px con nombre accesible; quien los usa reserva el espacio a la
 * derecha del input (EDIT_CONTROLS_PAD).
 */

/** Espacio a reservar a la derecha del texto del input: uno o dos íconos de 36px. */
export const EDIT_CONTROLS_PAD = { locked: 44, editing: 80 } as const;

const ICON = {
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export default function EditControls({
  what,
  editing,
  saving,
  onEdit,
  onSave,
  onCancel,
}: {
  /** "nombre" / "celular", para los nombres accesibles de los botones. */
  what: string;
  editing: boolean;
  saving: boolean;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const btn =
    "flex size-9 shrink-0 items-center justify-center rounded-[6px] transition-colors disabled:opacity-40";
  if (!editing) {
    return (
      <button
        type="button"
        onClick={onEdit}
        aria-label={`Editar ${what}`}
        title={`Editar ${what}`}
        className={`${btn} text-[var(--text-muted)] hover:bg-[var(--surface-raised)] hover:text-[var(--accent)]`}
      >
        <svg {...ICON}>
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
      </button>
    );
  }
  return (
    <span className="flex items-center">
      <button
        type="button"
        onClick={onCancel}
        disabled={saving}
        aria-label={`Cancelar cambio de ${what}`}
        title="Cancelar"
        className={`${btn} text-[var(--text-muted)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]`}
      >
        <svg {...ICON}>
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        </svg>
      </button>
      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        aria-label={saving ? `Guardando ${what}` : `Guardar ${what}`}
        title="Guardar"
        className={`${btn} text-[var(--accent)] hover:bg-[var(--surface-raised)] hover:text-[var(--accent-hover)]`}
      >
        <svg {...ICON} strokeWidth={2.5}>
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </button>
    </span>
  );
}

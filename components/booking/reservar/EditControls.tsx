/**
 * Controles de un dato guardado en la cuenta (nombre, celular) en /reservar: "Editar"
 * desbloquea el campo; "Guardar" lo escribe en la ficha y "Cancelar" vuelve al valor guardado.
 */
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
  const link = "text-xs transition-colors disabled:opacity-40";
  if (!editing) {
    return (
      <button
        type="button"
        onClick={onEdit}
        aria-label={`Editar ${what}`}
        className={`${link} flex items-center gap-1 text-[var(--accent)] hover:text-[var(--accent-hover)]`}
      >
        <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
        Editar
      </button>
    );
  }
  return (
    <span className="flex items-center gap-3">
      <button
        type="button"
        onClick={onCancel}
        disabled={saving}
        aria-label={`Cancelar cambio de ${what}`}
        className={`${link} text-[var(--text-muted)] hover:text-[var(--text-primary)]`}
      >
        Cancelar
      </button>
      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        aria-label={`Guardar ${what}`}
        className={`${link} font-medium text-[var(--accent)] hover:text-[var(--accent-hover)]`}
      >
        {saving ? "Guardando…" : "Guardar"}
      </button>
    </span>
  );
}

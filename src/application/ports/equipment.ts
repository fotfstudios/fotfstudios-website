import type { EquiposListQuery } from "@/src/domain/admin/equipos-list";
import type {
  EquipmentCategory,
  EquipmentDetailsInput,
  EquipmentInput,
  EquipmentStatus,
  MoveInput,
  PositionCatalog,
} from "@/src/domain/equipment/equipment";

/** Posición resuelta a nombres (para renderizar). */
export interface Position {
  locationId: string;
  locationName: string;
  resourceId: string | null;
  resourceName: string | null;
  spot: string | null;
  status: EquipmentStatus;
}

export interface EquipmentRow extends Position {
  id: string;
  category: EquipmentCategory;
  brand: string;
  model: string;
  nickname: string | null;
  serialNumber: string | null;
  quantity: number;
  updatedAt: string;
}

export interface EquipmentDetail extends EquipmentRow {
  purchasedAt: string | null;
  purchasePriceClp: number | null;
  vendor: string | null;
  warrantyUntil: string | null;
  notes: string | null;
  createdAt: string;
  /**
   * true solo mientras el ítem tiene exactamente su fila de alta y nada se separó de él —
   * ahí la cantidad todavía se puede corregir a mano; con cualquier movimiento (incluido un
   * split, en cualquiera de los dos ítems resultantes) se cambia solo desde Mover.
   */
  quantityEditable: boolean;
}

export interface EquipmentMoveRow {
  id: string;
  quantity: number;
  /** null = fila de alta. */
  from: Omit<Position, "locationId" | "resourceId"> | null;
  to: Omit<Position, "locationId" | "resourceId">;
  splitFromItemId: string | null;
  note: string | null;
  movedAt: string;
  movedByEmail: string | null;
}

export interface EquipmentRepository {
  list(query: EquiposListQuery): Promise<{ rows: EquipmentRow[]; total: number; grandTotal: number }>;
  get(id: string): Promise<EquipmentDetail | null>;
  /** Historial, más reciente primero. */
  history(id: string): Promise<EquipmentMoveRow[]>;
  /** Sedes y salas ACTIVAS (para nuevos movimientos). */
  positions(): Promise<PositionCatalog>;
  /** Alta vía RPC (ítem + fila de alta). Devuelve el id. */
  create(input: EquipmentInput, actor: string | null): Promise<string>;
  /** Detalles sin posición. La cantidad solo cambia mientras no hay movimientos. */
  updateDetails(id: string, patch: EquipmentDetailsInput): Promise<void>;
  /** Movimiento vía RPC. `split` = quedó un ítem nuevo (movimiento parcial). */
  move(id: string, move: MoveInput, actor: string | null): Promise<{ itemId: string; split: boolean }>;
  remove(id: string): Promise<void>;
}

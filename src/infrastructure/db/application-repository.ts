import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ApplicationRepository,
  ApplicationRow,
  ApplicationsListResult,
} from "@/src/application/ports/applications";
import type {
  ApplicationInput,
  ApplicationStatus,
  SessionFormat,
} from "@/src/domain/applications/application";
import {
  POSTULACION_TABS,
  TAB_TO_STATUS,
  type PostulacionTab,
  type PostulacionesListQuery,
} from "@/src/domain/admin/postulaciones-list";
import type { Database } from "./database.types";

type Row = Database["public"]["Tables"]["dj_applications"]["Row"];

function toRow(r: Row): ApplicationRow {
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    phone: r.phone,
    format: r.session_format as SessionFormat,
    availability: r.availability,
    mixUrl: r.mix_url,
    instagram: r.instagram,
    genres: r.genres,
    pitch: r.pitch,
    status: r.status as ApplicationStatus,
    createdAt: r.created_at,
  };
}

export class SupabaseApplicationRepository implements ApplicationRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async createApplication(input: ApplicationInput): Promise<string> {
    const { data, error } = await this.db
      .from("dj_applications")
      .insert({
        name: input.name,
        email: input.email,
        phone: input.phone,
        session_format: input.format,
        availability: input.availability,
        mix_url: input.mixUrl,
        instagram: input.instagram,
        genres: input.genres,
        pitch: input.pitch,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return data.id;
  }

  async listApplications(q: PostulacionesListQuery): Promise<ApplicationsListResult> {
    const from = (q.page - 1) * q.perPage;
    const status = TAB_TO_STATUS[q.estado];

    let query = this.db
      .from("dj_applications")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, from + q.perPage - 1);
    if (status) query = query.eq("status", status);

    const [{ data, count, error }, tabCounts] = await Promise.all([query, this.tabCounts()]);
    if (error) throw new Error(error.message);

    return {
      rows: (data ?? []).map(toRow),
      total: count ?? 0,
      tabCounts,
    };
  }

  async updateStatus(id: string, status: ApplicationStatus): Promise<void> {
    const { error } = await this.db.from("dj_applications").update({ status }).eq("id", id);
    if (error) throw new Error(error.message);
  }

  /** Conteo por tab (head:true → sin traer filas). "todas" suma el total. */
  private async tabCounts(): Promise<Record<PostulacionTab, number>> {
    const entries = await Promise.all(
      POSTULACION_TABS.map(async (tab) => {
        const status = TAB_TO_STATUS[tab];
        let q = this.db.from("dj_applications").select("id", { count: "exact", head: true });
        if (status) q = q.eq("status", status);
        const { count } = await q;
        return [tab, count ?? 0] as const;
      }),
    );
    return Object.fromEntries(entries) as Record<PostulacionTab, number>;
  }
}

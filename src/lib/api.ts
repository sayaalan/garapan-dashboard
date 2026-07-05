import { supabase } from "./supabase";

export interface GarapanRow {
  id: number;
  text: string;
  telegram_url: string;
  posted_at: string;
  flags: string[] | null;
}

export interface TrackedRow {
  id: number;
  garapan_id: number;
  user_id: string;
  status: string;
  notes: string | null;
  deadline: string | null;
  garapan?: GarapanRow;
}

export async function fetchGarapan(page: number, limit: number, filters?: string) {
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  let query = supabase.from("garapan").select("*", { count: "exact" }).order("posted_at", { ascending: false }).range(from, to);
  if (filters) {
    const arr = filters.split(",");
    query = query.overlaps("flags", arr);
  }
  const res = await query;
  return { items: (res.data || []) as GarapanRow[], total: res.count || 0 };
}

export async function fetchStats() {
  const [{ count }, { data: byFlag }] = await Promise.all([
    supabase.from("garapan").select("*", { count: "exact", head: true }),
    supabase.from("garapan").select("flags"),
  ]);
  const flagCounts: Record<string, number> = { total: count || 0 };
  (byFlag || []).forEach((row) => {
    (row.flags || []).forEach((f: string) => {
      flagCounts[f] = (flagCounts[f] || 0) + 1;
    });
  });
  return flagCounts;
}

export async function toggleTrack(garapanId: number, userId: string) {
  const { data: existing } = await supabase.from("tracked").select("id").eq("garapan_id", garapanId).eq("user_id", userId).maybeSingle();
  if (existing) {
    await supabase.from("tracked").delete().eq("id", existing.id);
    return { tracked: false };
  }
  await supabase.from("tracked").insert({ garapan_id: garapanId, user_id: userId, status: "pending" });
  return { tracked: true };
}

export async function fetchTracked(userId: string): Promise<TrackedRow[]> {
  const { data } = await supabase.from("tracked").select("*, garapan:garapan_id(*)").eq("user_id", userId).order("created_at", { ascending: false });
  return (data || []) as TrackedRow[];
}

export async function updateTracked(id: number, field: string, value: string) {
  await supabase.from("tracked").update({ [field]: value }).eq("id", id);
}

export async function deleteTracked(id: number) {
  await supabase.from("tracked").delete().eq("id", id);
}

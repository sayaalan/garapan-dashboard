import { supabase } from "./supabase";

export type Garapan = {
  id: number;
  text: string;
  flags: string[];
  links: string[];
  telegram_url: string;
  posted_at: string;
};

export type TrackedRow = {
  id: number;
  garapan_id: number;
  user_id: string;
  status: string;
  notes: string | null;
  deadline: string | null;
  garapan?: Garapan;
};

export async function fetchGarapan(opts?: { q?: string; filter?: string | null }): Promise<Garapan[]> {
  const q = opts?.q || "";
  const filter = opts?.filter || null;
  let query = supabase.from("garapan").select("*").order("posted_at", { ascending: false }).limit(500);
  if (filter) query = query.overlaps("flags", [filter]);
  if (q) query = query.ilike("text", `%${q}%`);
  const { data } = await query;
  return (data || []) as Garapan[];
}

export async function toggleTrack(garapanId: number): Promise<{ tracked: boolean }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { tracked: false };
  const uid = session.user.id;
  const { data: existing } = await supabase.from("tracked").select("id").eq("garapan_id", garapanId).eq("user_id", uid).maybeSingle();
  if (existing) {
    await supabase.from("tracked").delete().eq("id", existing.id);
    return { tracked: false };
  }
  await supabase.from("tracked").insert({ garapan_id: garapanId, user_id: uid, status: "todo" });
  return { tracked: true };
}

export async function fetchTrackedIds(): Promise<number[]> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return [];
  const uid = session.user.id;
  const { data } = await supabase.from("tracked").select("garapan_id").eq("user_id", uid);
  return ((data || []) as { garapan_id: number }[]).map(r => r.garapan_id);
}

export async function fetchTracked(): Promise<TrackedRow[]> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return [];
  const uid = session.user.id;
  const { data } = await supabase.from("tracked").select("*, garapan:garapan_id(*)").eq("user_id", uid).order("created_at", { ascending: false });
  return (data || []) as TrackedRow[];
}

export async function updateTracked(id: number, field: string, value: string) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;
  const uid = session.user.id;
  await supabase.from("tracked").update({ [field]: value }).eq("id", id).eq("user_id", uid);
}

export async function deleteTracked(id: number) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;
  const uid = session.user.id;
  await supabase.from("tracked").delete().eq("id", id).eq("user_id", uid);
}

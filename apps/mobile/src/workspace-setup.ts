import { PROFILE_TEMPLATES, RODRIGO_PILLARS, RODRIGO_PROFILE, rodrigoRoutine, type BusinessStrategy, type ContentFormat, type CreatorProfile, type Pillar, type ProfileTemplate, type RoutineBlock, watermarkCorner } from "@postai/domain";
import { newId } from "./config";
import { DEFAULT_SETTINGS, getWorkspace, saveWorkspace, type Workspace } from "./db/repo";
import { supabase } from "./supabase";

export interface OnboardingInput { name: string; profile: CreatorProfile; pillars: Pillar[] }

export const defaultOnboarding = (): OnboardingInput => ({ name: "RodrigoSerra.me", profile: { ...RODRIGO_PROFILE, kind: "pessoal" }, pillars: RODRIGO_PILLARS.map((p) => ({ ...p })) });

/** Kind + sales strategy travel in creator_profiles.tone. */
const rpcProfile = (p: CreatorProfile) => ({ ...p, tone: { kind: p.kind ?? "pessoal", business: p.business ?? null } });

/** Cloud: creates (or reuses) the workspace server-side, then mirrors it locally. Local mode: device only. */
export async function setupWorkspace(input: OnboardingInput): Promise<Workspace> {
  const routine = rodrigoRoutine(newId);
  if (!supabase) {
    const ws: Workspace = { id: newId(), name: input.name, cloud: false, profile: input.profile, pillars: input.pillars, routine, settings: DEFAULT_SETTINGS };
    await saveWorkspace(ws);
    return ws;
  }
  const { data: wsId, error } = await supabase.rpc("bootstrap_workspace", { p_name: input.name, p_profile: rpcProfile(input.profile), p_pillars: input.pillars, p_blocks: routine });
  if (error) throw new Error(`Não foi possível criar sua conta de conteúdo (${error.message}). Verifique a internet e tente de novo.`);
  return pullWorkspace(wsId as string);
}

/** Another profile for another moment of the day (company, product line...). Becomes the active one. */
export async function createProfile(template: ProfileTemplate, name: string): Promise<Workspace> {
  const id = newId();
  const routine = template.routine(newId);
  const profile: CreatorProfile = { ...template.profile, displayName: name, handle: name, signature: template.profile.kind === "empresa" ? name : template.profile.signature,
    business: template.profile.business ? { ...template.profile.business, brand: template.id === "empresa-nova" ? name : template.profile.business.brand } : undefined };
  const current = await getWorkspace();
  if (!supabase || current?.cloud === false) {
    const ws: Workspace = { id, name, cloud: false, profile, pillars: template.pillars, routine, settings: current?.settings ?? DEFAULT_SETTINGS };
    await saveWorkspace(ws);
    return ws;
  }
  const { error } = await supabase.rpc("create_profile", { p_id: id, p_name: name, p_profile: rpcProfile(profile), p_pillars: template.pillars, p_blocks: routine });
  if (error) throw new Error(`Não consegui criar o perfil (${error.message}). Precisa de internet para criar; depois funciona offline.`);
  return pullWorkspace(id, current?.settings);
}

export async function pullWorkspace(wsId: string, settings = DEFAULT_SETTINGS, activate = true): Promise<Workspace> {
  const db = supabase!;
  const [ws, prof, pillars, blocks] = await Promise.all([
    db.from("workspaces").select("id,name").eq("id", wsId).single(),
    db.from("creator_profiles").select("*").eq("workspace_id", wsId).single(),
    db.from("content_pillars").select("slug,name,target_percent,active").eq("workspace_id", wsId).order("target_percent", { ascending: false }),
    db.from("routine_blocks").select("id,weekday,start_time,title,content_hint,optional,default_format").eq("workspace_id", wsId),
  ]);
  const err = ws.error ?? prof.error ?? pillars.error ?? blocks.error;
  if (err) throw new Error(`Falha ao carregar seu workspace: ${err.message}`);
  const tone = (prof.data.tone ?? {}) as { kind?: string; business?: BusinessStrategy | null; watermark?: unknown };
  const workspace: Workspace = {
    id: wsId,
    name: ws.data?.name ?? "Meu workspace",
    cloud: true,
    profile: {
      displayName: prof.data.display_name, handle: prof.data.handle ?? "", positioning: prof.data.positioning ?? "", signature: prof.data.signature ?? "",
      closingPhrase: prof.data.closing_phrase ?? "", voiceRules: prof.data.voice_rules ?? RODRIGO_PROFILE.voiceRules,
      kind: tone.kind === "empresa" ? "empresa" : "pessoal", business: tone.kind === "empresa" && tone.business ? tone.business : undefined,
      watermark: watermarkCorner(tone.watermark),
    },
    pillars: (pillars.data ?? []).map((p) => ({ slug: p.slug, name: p.name, targetPercent: Number(p.target_percent), active: p.active })),
    routine: (blocks.data ?? []).map((b): RoutineBlock => ({
      id: b.id, weekday: b.weekday, startTime: String(b.start_time).slice(0, 5), title: b.title, contentHint: b.content_hint, optional: b.optional, format: b.default_format as ContentFormat,
    })),
    settings,
  };
  await saveWorkspace(workspace, activate);
  return workspace;
}

/** After login on a device that has no local data yet: every profile this account owns, oldest first. */
export async function findRemoteWorkspaces(): Promise<string[]> {
  if (!supabase) return [];
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return [];
  const { data } = await supabase.from("workspace_members").select("workspace_id").eq("user_id", auth.user.id).eq("role", "owner").order("created_at");
  return (data ?? []).map((r) => r.workspace_id as string);
}

/** Pulls every profile; the first (oldest) one stays active. */
export async function pullAllWorkspaces(ids: readonly string[]): Promise<void> {
  for (const [i, id] of [...ids].reverse().entries()) await pullWorkspace(id, DEFAULT_SETTINGS, i === ids.length - 1);
}

export { PROFILE_TEMPLATES };

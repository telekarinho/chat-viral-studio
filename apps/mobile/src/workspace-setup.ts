import { RODRIGO_PILLARS, RODRIGO_PROFILE, rodrigoRoutine, type ContentFormat, type CreatorProfile, type Pillar, type RoutineBlock } from "@postai/domain";
import { newId } from "./config";
import { DEFAULT_SETTINGS, saveWorkspace, type Workspace } from "./db/repo";
import { supabase } from "./supabase";

export interface OnboardingInput { name: string; profile: CreatorProfile; pillars: Pillar[] }

export const defaultOnboarding = (): OnboardingInput => ({ name: "RodrigoSerra.me", profile: { ...RODRIGO_PROFILE }, pillars: RODRIGO_PILLARS.map((p) => ({ ...p })) });

/** Cloud: creates (or reuses) the workspace server-side, then mirrors it locally. Local mode: device only. */
export async function setupWorkspace(input: OnboardingInput): Promise<Workspace> {
  const routine = rodrigoRoutine(newId);
  if (!supabase) {
    const ws: Workspace = { id: newId(), name: input.name, cloud: false, profile: input.profile, pillars: input.pillars, routine, settings: DEFAULT_SETTINGS };
    await saveWorkspace(ws);
    return ws;
  }
  const { data: wsId, error } = await supabase.rpc("bootstrap_workspace", { p_name: input.name, p_profile: input.profile, p_pillars: input.pillars, p_blocks: routine });
  if (error) throw new Error(`Não foi possível criar sua conta de conteúdo (${error.message}). Verifique a internet e tente de novo.`);
  return pullWorkspace(wsId as string);
}

export async function pullWorkspace(wsId: string): Promise<Workspace> {
  const db = supabase!;
  const [ws, prof, pillars, blocks] = await Promise.all([
    db.from("workspaces").select("id,name").eq("id", wsId).single(),
    db.from("creator_profiles").select("*").eq("workspace_id", wsId).single(),
    db.from("content_pillars").select("slug,name,target_percent,active").eq("workspace_id", wsId).order("target_percent", { ascending: false }),
    db.from("routine_blocks").select("id,weekday,start_time,title,content_hint,optional,default_format").eq("workspace_id", wsId),
  ]);
  const err = ws.error ?? prof.error ?? pillars.error ?? blocks.error;
  if (err) throw new Error(`Falha ao carregar seu workspace: ${err.message}`);
  const workspace: Workspace = {
    id: wsId,
    name: ws.data?.name ?? "Meu workspace",
    cloud: true,
    profile: {
      displayName: prof.data.display_name, handle: prof.data.handle ?? "", positioning: prof.data.positioning ?? "", signature: prof.data.signature ?? "",
      closingPhrase: prof.data.closing_phrase ?? "", voiceRules: prof.data.voice_rules ?? RODRIGO_PROFILE.voiceRules,
    },
    pillars: (pillars.data ?? []).map((p) => ({ slug: p.slug, name: p.name, targetPercent: Number(p.target_percent), active: p.active })),
    routine: (blocks.data ?? []).map((b): RoutineBlock => ({
      id: b.id, weekday: b.weekday, startTime: String(b.start_time).slice(0, 5), title: b.title, contentHint: b.content_hint, optional: b.optional, format: b.default_format as ContentFormat,
    })),
    settings: DEFAULT_SETTINGS,
  };
  await saveWorkspace(workspace);
  return workspace;
}

/** After login on a device that has no local data yet. */
export async function findRemoteWorkspace(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.from("workspace_members").select("workspace_id").limit(1);
  return data?.[0]?.workspace_id ?? null;
}

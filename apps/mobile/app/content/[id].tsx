import { useCallback, useEffect, useState } from "react";
import { Text, TextInput, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { FORMAT_LABEL, PLATFORMS, PLATFORM_LABEL, buildEditPlan, buildSegments, isBusiness, wholeTakeSegment, type EditPlan, type Platform, type ScriptSegment } from "@postai/domain";
import { completeContent, getContent, latestTakesBySegment, listTakes, listTasks, setEditChoices, workspaceById, selectHook, type ContentItem, type Take, type Workspace } from "../../src/db/repo";
import { ProjectPanel } from "../../src/components/ProjectPanel";
import { FinishOptions } from "../../src/components/FinishOptions";
import { generateForContent, saveUserEdit } from "../../src/generate";
import { reportError } from "../../src/telemetry";
import { downloadFinal, latestRenderJob, localFinal, requestFinalRender, type RenderJob } from "../../src/finalRender";
import { Button, Card, Chip, ErrorBox, Eyebrow, H1, Loading, Screen, Section, colors, s } from "../../src/ui";

export default function ContentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [c, setC] = useState<ContentItem | null>(null);
  const [takes, setTakes] = useState<Take[]>([]);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [platform, setPlatform] = useState<Platform>("instagram");
  const [copied, setCopied] = useState<string | null>(null);
  const [parts, setParts] = useState<{ segments: ScriptSegment[]; recorded: number[]; plan: EditPlan | null } | null>(null);
  const [job, setJob] = useState<RenderJob | null>(null);
  const [finalUri, setFinalUri] = useState<string | null>(null);
  const [owner, setOwner] = useState<{ ws: Workspace; takes: Take[] } | null>(null);
  const [business, setBusiness] = useState(false);

  const load = useCallback(async () => {
    const item = await getContent(id);
    setC(item);
    const own = await listTakes({ contentItemId: id });
    setTakes(own);
    if (item?.project) {
      // a derived piece reuses the recording of its origin
      const clipTakes = own.length || !item.derivedFrom ? own : await listTakes({ contentItemId: item.derivedFrom });
      setOwner({ ws: await workspaceById(item.workspaceId), takes: clipTakes });
    }
    if (item) setTaskId((await listTasks(item.date)).find((t) => t.contentItemId === id && t.status === "pending")?.id ?? null);
    if (item?.draft) {
      const ws = await workspaceById(item.workspaceId);
      setBusiness(isBusiness(ws.profile));
      const segments = buildSegments(item.draft, { selectedHook: item.selectedHook ?? 0, userEdited: Boolean(item.meta?.userEdited), closingPhrase: ws.profile.closingPhrase, business: isBusiness(ws.profile) });
      const chosen = await latestTakesBySegment(item.id);
      const recorded = segments.filter((sg) => chosen.has(sg.index)).map((sg) => sg.index);
      const whole = recorded.length === 0 ? (await listTakes({ contentItemId: item.id })).find((t) => t.segmentIndex === null && !t.tags.includes("descartado")) : undefined;
      const plan = recorded.length === segments.length
        ? buildEditPlan({ segments, signature: ws.profile.signature, takes: segments.map((sg) => ({ segmentIndex: sg.index, takeId: chosen.get(sg.index)!.id, durationMs: chosen.get(sg.index)!.media.durationMs ?? 0 })) })
        : whole
          ? buildEditPlan({ segments: [wholeTakeSegment(item.draft)], signature: ws.profile.signature, takes: [{ segmentIndex: 0, takeId: whole.id, durationMs: whole.media.durationMs ?? 0 }] })
          : null;
      setParts({ segments, recorded, plan });
      setFinalUri(await localFinal(item.id));
      if (plan) setJob(await latestRenderJob(item.id).catch(() => null));
    }
  }, [id]);
  useFocusEffect(useCallback(() => void load().catch((e) => setError(String(e))), [load]));

  // montagem na fila: acompanha sozinho até ficar pronta
  const pendingJob = job?.status === "queued" || job?.status === "rendering";
  useEffect(() => {
    if (!pendingJob || !c) return;
    const t = setInterval(() => void latestRenderJob(c.id).then(setJob).catch(() => undefined), 20_000);
    return () => clearInterval(t);
  }, [pendingJob, c]);

  // tudo automático: quando todas as partes estão gravadas e na nuvem, a montagem começa sozinha
  const [autoMsg, setAutoMsg] = useState<string | null>(null);
  const readyToAuto = Boolean(c && parts?.plan && !finalUri && !job);
  useEffect(() => {
    if (!readyToAuto || !c || !parts?.plan) return;
    const plan = parts.plan;
    const attempt = () => void requestFinalRender(c.workspaceId, c.id, plan).then((r) => {
      if (r.ok) {
        setAutoMsg(null);
        void latestRenderJob(c.id).then(setJob);
      } else setAutoMsg(r.reason);
    }).catch(() => undefined);
    attempt();
    const t = setInterval(attempt, 20_000);
    return () => clearInterval(t);
  }, [readyToAuto, c, parts]);

  // ...e quando fica pronta, baixa sozinha para o aparelho
  useEffect(() => {
    if (!c || job?.status !== "done" || finalUri) return;
    void downloadFinal(c.id, job).then(setFinalUri).catch(() => undefined);
  }, [c, job, finalUri]);

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      reportError(e, label);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function copy(label: string, text: string) {
    await Clipboard.setStringAsync(text);
    setCopied(label); // stays until another copy / platform change, so it's easy to confirm
  }

  if (!c) return <Screen><Loading /></Screen>;
  const d = c.draft;
  const recordParams = { contentId: c.id, taskId: taskId ?? "" };

  return (
    <Screen testID="content-screen">
      <Button variant="ghost" compact label="← Voltar" onPress={() => router.back()} />
      <Eyebrow>{`${FORMAT_LABEL[c.format]} · ${c.draft?.pillar ?? c.pillarSlug}`}</Eyebrow>
      <H1>{d?.title ?? "Sem roteiro ainda"}</H1>
      {error ? <ErrorBox message={error} /> : null}
      {c.project && owner ? <ProjectPanel c={c} ws={owner.ws} takes={owner.takes} onChange={() => void load()} /> : null}

      {!d ? (
        <Card style={{ gap: 10 }}>
          <Text style={s.body}>Gere o roteiro. Se estiver sem internet, uso o gerador offline.</Text>
          <Button label="GERAR ROTEIRO" onPress={() => run("gerar", () => generateForContent(c.id))} loading={busy === "gerar"} testID="content-generate" />
          <Button variant="secondary" label="GERAR COM MEU CHATGPT / CLAUDE" onPress={() => router.push(`/manual/${c.id}`)} />
        </Card>
      ) : (
        <>
          {c.meta?.notices?.length ? (
            <Card style={{ backgroundColor: "#FFF8E8" }} testID="repetition-notice">
              {c.meta.notices.map((n) => <Text key={n} style={{ color: colors.warn, fontWeight: "700" }}>{n}</Text>)}
            </Card>
          ) : null}
          <Text style={s.muted}>
            {c.meta?.source === "openai" || c.meta?.source === "gemini" ? `IA · ${c.meta.model}` : c.meta?.model === "manual-assistant" ? "Do seu ChatGPT/Claude" : "Gerador offline"} · {c.meta?.prompt_version}
            {c.meta?.userEdited ? " · editado por você" : ""}
          </Text>

          <Button label={parts && parts.recorded.length > 0 && parts.recorded.length < parts.segments.length ? `CONTINUAR POR PARTES (${parts.recorded.length}/${parts.segments.length})` : "GRAVAR POR PARTES"} onPress={() => router.push({ pathname: "/record", params: { ...recordParams, partes: "1" } })} testID="record-parts" />
          <View style={s.row}>
            <Button variant="secondary" label="TELEPROMPTER + GRAVAR TUDO" onPress={() => router.push({ pathname: "/record", params: { ...recordParams, prompter: "1" } })} testID="open-teleprompter" />
            <Button variant="ghost" label="SÓ GRAVAR" onPress={() => router.push({ pathname: "/record", params: recordParams })} />
          </View>

          <Section>3 ganchos — escolha um</Section>
          {d.hook_options.map((h, i) => (
            <Card key={i} style={{ borderWidth: 2, borderColor: (c.selectedHook ?? 0) === i ? colors.ink : "transparent" }} testID={`hook-${i}`}>
              <Text style={{ fontSize: 16, fontWeight: "700", color: colors.ink }} onPress={() => run("hook", () => selectHook(c.id, i))} accessibilityRole="button">
                {i + 1}. {h}
              </Text>
            </Card>
          ))}

          <Section>Estrutura</Section>
          {([["E", d.narrative.e], ["MAS", d.narrative.mas], ["POR ISSO", d.narrative.por_isso]] as const).map(([k, v]) => (
            <Card key={k} testID={`narrative-${k}`}>
              <Text style={{ fontSize: 12, fontWeight: "900", color: colors.accent, letterSpacing: 1 }}>{k}</Text>
              <Text style={s.body}>{v}</Text>
            </Card>
          ))}

          <Section>Roteiro ({d.duration_seconds}s)</Section>
          <Card style={{ gap: 10 }}>
            {editing !== null ? (
              <>
                <TextInput style={[s.input, { minHeight: 180, textAlignVertical: "top" }]} multiline value={editing} onChangeText={setEditing} accessibilityLabel="Editar roteiro" testID="script-editor" />
                <View style={s.row}>
                  <Button compact label="SALVAR" onPress={() => run("editar", async () => { await saveUserEdit(c.id, editing); setEditing(null); })} loading={busy === "editar"} />
                  <Button compact variant="ghost" label="CANCELAR" onPress={() => setEditing(null)} />
                </View>
              </>
            ) : (
              <>
                <Text style={s.body} testID="script-text">{d.script}</Text>
                <View style={s.row}>
                  <Button compact variant="secondary" label="EDITAR" onPress={() => setEditing(d.script)} />
                  <Button compact variant="secondary" label={copied === "script" ? "COPIADO ✓" : "COPIAR"} onPress={() => copy("script", d.script)} />
                </View>
              </>
            )}
            {d.screen_text ? <Text style={s.muted}>Texto na tela: {d.screen_text}</Text> : null}
            <Text style={s.muted}>CTA: {d.cta}</Text>
          </Card>

          {d.versions.length ? <Section>Versões</Section> : null}
          {d.versions.map((v) => (
            <Card key={v.duration_seconds}>
              <Text style={{ fontWeight: "900", color: colors.ink }}>{v.duration_seconds}s</Text>
              <Text style={s.body}>{v.script}</Text>
            </Card>
          ))}

          <Section>Cenas sugeridas / B-roll</Section>
          <Card>
            {d.recording_suggestions.map((r, i) => <Text key={i} style={s.body}>• {r.scene} ({r.duration_seconds}s){r.location_hint ? ` — ${r.location_hint}` : ""}</Text>)}
          </Card>

          <Section>Legenda para postar</Section>
          <View style={s.row}>
            {PLATFORMS.map((p) => <Chip key={p} label={PLATFORM_LABEL[p]} selected={platform === p} onPress={() => { setPlatform(p); setCopied(null); }} testID={`platform-${p}`} />)}
          </View>
          <Card style={{ gap: 10 }} testID="caption-card">
            <Text style={s.body} selectable testID="caption-text">{d.caption[platform]}</Text>
            <Button compact label={copied === platform ? "LEGENDA COPIADA ✓" : `COPIAR LEGENDA ${PLATFORM_LABEL[platform].toUpperCase()}`} onPress={() => copy(platform, d.caption[platform])} testID="copy-caption" />
          </Card>

          {parts ? (
            <>
              <Section>Partes ({parts.recorded.length}/{parts.segments.length})</Section>
              <Card testID="parts-card">
                {parts.segments.map((sg) => (
                  <Text key={sg.index} style={{ color: parts.recorded.includes(sg.index) ? colors.good : colors.muted, fontWeight: "700" }}>
                    {parts.recorded.includes(sg.index) ? "✓" : "○"} {sg.index + 1}. {sg.label}
                  </Text>
                ))}
              </Card>
              {parts.plan ? (
                <Card testID="edit-plan" style={{ gap: 4 }}>
                  <Text style={{ fontWeight: "900", color: colors.ink }}>{`Edição automática pronta · ${Math.round(parts.plan.totalMs / 1000)}s · retoque leve incluído`}</Text>
                  {parts.plan.clips.map((c) => (
                    <Text key={c.segmentIndex} style={s.muted}>{c.segmentIndex + 1}. {EFFECT_LABEL[c.effect.kind]} · {(c.durationMs / 1000).toFixed(1)}s · {c.captions.length} {c.captions.length === 1 ? "legenda" : "legendas"}</Text>
                  ))}
                  <Text style={s.muted}>{`Assinatura ${parts.plan.signature}. A montagem (juntar, efeitos, legenda da sua fala e música) roda no servidor de edição.`}</Text>
                  <FinishOptions value={c.edit} pillarSlug={c.pillarSlug} business={business} onChange={(v) => void setEditChoices(c.id, v).then(setC)} />
                  {finalUri ? (
                    <>
                      <Button compact label="VER VÍDEO FINAL / POSTAR" onPress={() => router.push(`/final/${c.id}`)} testID="open-final" />
                      <Button compact variant="secondary" label="REFAZER COM ESTA LEGENDA / MÚSICA" loading={busy === "montar"} onPress={() => run("montar", async () => {
                        const r = await requestFinalRender(c.workspaceId, c.id, parts.plan!);
                        if (!r.ok) throw new Error(r.reason);
                        setFinalUri(null);
                      })} />
                    </>
                  ) : job?.status === "done" ? (
                    <Button compact label="BAIXAR VÍDEO FINAL" onPress={() => run("baixar", async () => { await downloadFinal(c.id, job); router.push(`/final/${c.id}`); })} loading={busy === "baixar"} testID="download-final" />
                  ) : job && (job.status === "queued" || job.status === "rendering") ? (
                    <>
                      <Text style={{ color: colors.info, fontWeight: "800" }}>{job.status === "queued" ? "Na fila de montagem… (fica pronto em até ~10 min, pode sair desta tela)" : "Montando o vídeo…"}</Text>
                      <Button compact variant="secondary" label="ATUALIZAR" onPress={() => void load()} />
                    </>
                  ) : (
                    <>
                      {job?.status === "failed" ? <Text style={{ color: colors.bad }}>A montagem falhou: {job.error}</Text> : null}
                      {!job && autoMsg ? <Text style={{ color: colors.info, fontWeight: "700" }} testID="auto-render-status">{`Montagem automática: ${autoMsg}`}</Text> : null}
                      <Button compact label="MELHORAR E FINALIZAR (retoque + legenda + música)" loading={busy === "montar"} testID="request-final" onPress={() => run("montar", async () => {
                        const r = await requestFinalRender(c.workspaceId, c.id, parts.plan!);
                        if (!r.ok) throw new Error(r.reason);
                      })} />
                    </>
                  )}
                </Card>
              ) : null}
            </>
          ) : null}

          <Section>Takes deste conteúdo ({takes.length})</Section>
          {takes.map((t) => (
            <Card key={t.id}>
              <Text style={{ fontWeight: "700", color: colors.ink }} onPress={() => router.push(`/take/${t.id}`)} accessibilityRole="link">
                Take de {new Date(t.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} · {Math.round(t.media.sizeBytes / 1_048_576)} MB
              </Text>
            </Card>
          ))}

          <View style={{ gap: 10, marginTop: 8 }}>
            {c.status !== "done" ? (
              <Button label="MARCAR CONTEÚDO CONCLUÍDO" onPress={() => run("concluir", () => completeContent(c.id))} loading={busy === "concluir"} testID="complete-content" />
            ) : (
              <Card testID="content-done"><Text style={{ color: colors.good, fontWeight: "900" }}>CONCLUÍDO ✓ — bora pro próximo.</Text></Card>
            )}
            <Button variant="secondary" label="GERAR OUTRO ÂNGULO" onPress={() => run("gerar", () => generateForContent(c.id))} loading={busy === "gerar"} testID="regenerate" />
            <Button variant="secondary" label="GERAR COM MEU CHATGPT / CLAUDE" onPress={() => router.push(`/manual/${c.id}`)} testID="manual-assistant" />
            <Button variant="ghost" label="VOLTAR PARA HOJE" onPress={() => router.replace("/")} testID="back-today" />
          </View>
        </>
      )}
    </Screen>
  );
}

const EFFECT_LABEL: Record<EditPlan["clips"][number]["effect"]["kind"], string> = {
  punch_in: "zoom rápido (punch-in)",
  slow_zoom_in: "zoom lento",
  zoom_out_reveal: "corte + zoom-out na virada",
  push_in: "aproximação",
  hold: "enquadramento fixo",
  zoom_out_end: "zoom-out final + assinatura",
};

import { useCallback, useEffect, useState } from "react";
import { Linking, Text, TextInput, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { FORMAT_LABEL, PLATFORMS, PLATFORM_LABEL, SHORT_ROLES, WATERMARK_LABEL, type EditPlan, type Platform, type ScriptSegment } from "@postai/domain";
import { completeContent, getContent, listTakes, listTasks, setEditChoices, workspaceById, selectHook, type ContentItem, type Take, type Workspace } from "../../src/db/repo";
import { ProjectPanel } from "../../src/components/ProjectPanel";
import { DirectorSheet } from "../../src/components/DirectorSheet";
import { FinishOptions } from "../../src/components/FinishOptions";
import { FREE_SPEECH_MODEL } from "../../src/freeSpeech";
import { generateForContent, saveUserEdit } from "../../src/generate";
import { reportError } from "../../src/telemetry";
import { setContentOnScreen } from "../../src/renderWatch";
import { MetricsCard } from "../../src/components/MetricsCard";
import { useApp } from "../../src/app-state";
import { DirectionCard, ScenesCard } from "../../src/components/DirectionCard";
import { pullAssistantDraft } from "../../src/assistant";
import { contentPlan } from "../../src/finalPlan";
import { describeResult, downloadFinal, latestRenderJob, localFinal, localResult, requestFinalRender, type RenderJob, type RenderResult } from "../../src/finalRender";
import { Button, Card, Chip, ErrorBox, Eyebrow, H1, Loading, Screen, Section, colors, s } from "../../src/ui";

export default function ContentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { workspace } = useApp();
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
  // id do job cujo download automático falhou: só então aparece o botão BAIXAR (antes, um toque disputava com o download automático)
  const [dlFailedJob, setDlFailedJob] = useState<string | null>(null);
  const [owner, setOwner] = useState<{ ws: Workspace; takes: Take[] } | null>(null);
  const [business, setBusiness] = useState(false);
  const [assistantMsg, setAssistantMsg] = useState<string | null>(null);
  const [directorOpen, setDirectorOpen] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showCaption, setShowCaption] = useState(false);

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
    const cp = item ? await contentPlan(item) : null;
    if (item?.draft && cp) {
      setBusiness(cp.business);
      setParts({ segments: cp.segments, recorded: cp.recorded, plan: cp.plan });
      setFinalUri(await localFinal(item.id));
      setResult(await localResult(item.id));
      const shortUri = await localFinal(item.id, "curto");
      if (cp.plan) {
        try {
          setJob(await latestRenderJob(item.id));
          setShort({ job: await latestRenderJob(item.id, "curto"), uri: shortUri });
          setJobKnown(true);
        } catch {
          // sem internet: não dá para saber se já existe montagem — não pede outra às cegas
          setJobKnown(false);
        }
      }
    }
  }, [id]);
  useFocusEffect(useCallback(() => void load().catch((e) => setError(String(e))), [load]));
  // roteiro escrito pelo assistente (Claude) pelo conector: chega em segundo plano (sem travar a tela offline)
  useFocusEffect(useCallback(() => {
    void pullAssistantDraft(id).then((r) => {
      if (!r) return;
      setAssistantMsg("content" in r ? "✨ Chegou o roteiro escrito pelo seu assistente (Claude)." : `O roteiro do assistente foi recusado: ${r.errors.join(" ")}`);
      if ("content" in r) void load();
    }).catch(() => undefined);
  }, [id, load]));
  // esta tela já acompanha e baixa o vídeo sozinha: sem aviso duplicado enquanto ela está aberta
  useFocusEffect(useCallback(() => {
    setContentOnScreen(id);
    return () => setContentOnScreen(null);
  }, [id]));

  // montagem na fila: acompanha sozinho até ficar pronta
  const pendingJob = job?.status === "queued" || job?.status === "rendering";
  useEffect(() => {
    if (!pendingJob || !c) return;
    const t = setInterval(() => void latestRenderJob(c.id).then((j) => { setJob(j); setAutoMsg(null); }).catch(() => setAutoMsg("Sem internet para acompanhar a montagem. Ela continua no servidor.")), 20_000);
    return () => clearInterval(t);
  }, [pendingJob, c]);

  // material completo: a montagem é pedida em Finalizar (com a proposta do Diretor), não sozinha aqui
  const [autoMsg, setAutoMsg] = useState<string | null>(null);
  const [jobKnown, setJobKnown] = useState(false);
  const [short, setShort] = useState<{ job: RenderJob | null; uri: string | null }>({ job: null, uri: null });
  const [result, setResult] = useState<RenderResult | null>(null);

  // versão curta: acompanha e baixa sozinha
  const shortPending = short.job?.status === "queued" || short.job?.status === "rendering";
  useEffect(() => {
    if (!c || !shortPending) return;
    const t = setInterval(() => void latestRenderJob(c.id, "curto").then((j) => setShort((sh) => ({ ...sh, job: j }))).catch(() => undefined), 20_000);
    return () => clearInterval(t);
  }, [c, shortPending]);
  useEffect(() => {
    if (!c || short.job?.status !== "done" || short.uri) return;
    const j = short.job;
    void downloadFinal(c.id, j).then((uri) => setShort({ job: j, uri }))
      .catch((e: unknown) => setAutoMsg(`A versão curta está pronta, mas não consegui baixar: ${e instanceof Error ? e.message : String(e)}`));
  }, [c, short]);

  // ...e quando fica pronta, baixa sozinha para o aparelho
  useEffect(() => {
    if (!c || job?.status !== "done" || finalUri) return;
    void downloadFinal(c.id, job).then((uri) => { setFinalUri(uri); setResult(job.result); })
      .catch((e: unknown) => {
        setDlFailedJob(job.id);
        setAutoMsg(`O vídeo está pronto, mas não consegui baixar: ${e instanceof Error ? e.message : String(e)}. Toque em BAIXAR VÍDEO FINAL.`);
      });
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
  const free = c.meta?.model === FREE_SPEECH_MODEL;
  const canShort = Boolean(parts && parts.recorded.length > 1 && parts.segments.filter((sg) => SHORT_ROLES.includes(sg.role)).length >= 2);
  // fase do vídeo: gravando → material completo → pronto (cada fase mostra só o que importa agora)
  const phase: "gravando" | "completo" | "pronto" = finalUri ? "pronto" : parts?.plan ? "completo" : "gravando";
  const published = Boolean(c.posted) || c.status === "published";
  const sheet = d ? (
    <DirectorSheet visible={directorOpen} onClose={() => setDirectorOpen(false)} workspaceId={c.workspaceId} contentId={c.id}
      segments={parts?.segments ?? []} recorded={parts?.recorded ?? []} business={business} cloud={Boolean(workspace?.cloud)} />
  ) : null;

  return (
    <Screen testID="content-screen">
      <Button variant="ghost" compact label="← Voltar" onPress={() => router.back()} />
      <Eyebrow>{`${FORMAT_LABEL[c.format]} · ${c.draft?.pillar ?? c.pillarSlug}`}</Eyebrow>
      <H1>{d?.title ?? "Sem roteiro ainda"}</H1>
      {error ? <ErrorBox message={error} /> : null}
      {assistantMsg ? <Card testID="assistant-draft"><Text style={{ color: colors.good, fontWeight: "800" }}>{assistantMsg}</Text></Card> : null}
      {sheet}
      {phase === "pronto" ? (
        <Card style={{ gap: 10 }} testID="phase-ready">
          <Text style={{ color: colors.good, fontWeight: "900", fontSize: 18 }}>VÍDEO PRONTO ✓</Text>
          <Button label="▶ VER, APROVAR E PUBLICAR" onPress={() => router.push(`/final/${c.id}`)} testID="top-open-final" />
        </Card>
      ) : phase === "completo" && !free ? (
        <Card style={{ gap: 10 }} testID="phase-complete">
          <Text style={{ color: colors.good, fontWeight: "900", fontSize: 18 }}>MATERIAL COMPLETO ✓</Text>
          <Text style={s.muted}>{`${parts!.segments.length} parte(s) gravada(s). Seu Diretor monta; você aprova.`}</Text>
          <Button label="FINALIZAR" onPress={() => router.push(`/finalizar/${c.id}`)} testID="open-finalizar" />
          <View style={s.row}>
            <Button compact variant="secondary" label="VER PROPOSTA DO DIRETOR" onPress={() => router.push(`/finalizar/${c.id}`)} testID="open-proposal" />
            <Button compact variant="ghost" label="🎬 FALAR COM O DIRETOR" onPress={() => setDirectorOpen(true)} testID="open-director" />
          </View>
        </Card>
      ) : null}
      {c.project && owner ? <ProjectPanel c={c} ws={owner.ws} takes={owner.takes} onChange={() => void load()} /> : null}

      {c.format === "broll" ? (
        <>
          {c.cenas?.length ? <ScenesCard takes={c.cenas} /> : (
            <Card><Text style={s.body}>Cena de apoio sem fala. Peça ao Claude as cenas desta prova visual (ele usa salvar_cenas) ou grave do seu jeito.</Text></Card>
          )}
          <Button label="GRAVAR CENA" onPress={() => router.push({ pathname: "/record", params: recordParams })} testID="record-scene" />
          <Section>{`Takes desta cena (${takes.length})`}</Section>
          {takes.map((t) => (
            <Card key={t.id}>
              <Text style={{ fontWeight: "700", color: colors.ink }} onPress={() => router.push(`/take/${t.id}`)} accessibilityRole="link">
                Take de {new Date(t.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              </Text>
            </Card>
          ))}
        </>
      ) : !d ? (
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
          {c.meta?.model === "manual-assistant" ? (
            <Card testID="from-assistant"><Text style={{ color: colors.info, fontWeight: "800" }}>📝 Este roteiro foi escrito pelo seu assistente (Claude/ChatGPT){c.meta?.userEdited ? " e editado por você" : ""}.</Text></Card>
          ) : (
            <Text style={s.muted}>
              {c.meta?.source === "openai" || c.meta?.source === "gemini" ? `IA · ${c.meta.model}` : "Gerador offline"} · {c.meta?.prompt_version}
              {c.meta?.userEdited ? " · editado por você" : ""}
            </Text>
          )}
          <Button compact variant="secondary" label={copied === "melhorar" ? "PEDIDO COPIADO ✓ — cole no Claude" : "✨ MELHORAR ESTE ROTEIRO COM O CLAUDE"} testID="improve-with-claude" onPress={() => {
            const ask = `No Post.ai (profile_id ${c.workspaceId}), use ler_roteiro no conteúdo ${c.id}, melhore o roteiro seguindo instrucoes_do_roteiro (com a direção completa: takes, texto na tela, música, capa e publicação) e salve com salvar_roteiro.`;
            void copy("melhorar", ask).then(() => Linking.openURL(`https://claude.ai/new?q=${encodeURIComponent(ask)}`)).catch(() => undefined);
          }} />

          {free ? (
            <Card style={{ gap: 8 }}>
              <Text style={s.body}>Fala livre: grave do seu jeito. O app corta erros e pausas, legenda pelo que você disser, põe música e deixa pronto.</Text>
              {takes.length === 0 ? <Button label="GRAVAR" onPress={() => router.push({ pathname: "/record", params: recordParams })} testID="record-free" /> : null}
              {result?.transcript ? (
                <>
                  <Text style={s.label}>O que você disse (use como legenda do post)</Text>
                  <Text style={s.body} selectable>{result.transcript}</Text>
                  <Button compact variant="secondary" label={copied === "fala" ? "COPIADO ✓" : "COPIAR TEXTO"} onPress={() => copy("fala", `${result.transcript}

${owner?.ws.profile.signature ?? ""}`.trim())} />
                </>
              ) : null}
            </Card>
          ) : null}
          {free ? null : (<>
          {phase === "gravando" ? (
            <Card style={{ gap: 10 }} testID="director-card">
              <Text style={{ fontSize: 12, fontWeight: "900", color: colors.accent, letterSpacing: 1 }}>🎬 DIRETOR DE CRIAÇÃO</Text>
              <Text style={s.body}><Text style={{ fontWeight: "900" }}>Objetivo: </Text>{d.key_phrase}</Text>
              <Text style={s.body}><Text style={{ fontWeight: "900" }}>Gancho: </Text>{`“${d.hook_options[c.selectedHook ?? 0] ?? d.hook_options[0]}”`}</Text>
              {parts ? (
                <View testID="parts-card">
                  <Text style={[s.label, { marginBottom: 2 }]}>{`Takes necessários · ${parts.recorded.length} de ${parts.segments.length}`}</Text>
                  {parts.segments.map((sg) => (
                    <Text key={sg.index} style={{ color: parts.recorded.includes(sg.index) ? colors.good : colors.muted, fontWeight: "700" }}>
                      {`${parts.recorded.includes(sg.index) ? "✅" : "○"} ${sg.label}`}
                    </Text>
                  ))}
                </View>
              ) : null}
              <Button label={parts && parts.recorded.length > 0 ? `CONTINUAR GRAVAÇÃO (${parts.recorded.length}/${parts.segments.length})` : "GRAVAR POR PARTES"}
                onPress={() => router.push({ pathname: "/record", params: { ...recordParams, partes: "1" } })} testID="record-parts" />
              <Button variant="secondary" label="🎬 FALAR COM O DIRETOR" onPress={() => setDirectorOpen(true)} testID="open-director" />
              <View style={s.row}>
                <Button compact variant="ghost" label="TELEPROMPTER + GRAVAR TUDO" onPress={() => router.push({ pathname: "/record", params: { ...recordParams, prompter: "1" } })} testID="open-teleprompter" />
                <Button compact variant="ghost" label="SÓ GRAVAR" onPress={() => router.push({ pathname: "/record", params: recordParams })} />
              </View>
            </Card>
          ) : (
            <Button variant="ghost" label={showDetails ? "Esconder roteiro e detalhes" : "Ver roteiro e detalhes"} onPress={() => setShowDetails(!showDetails)} testID="toggle-details" />
          )}
          {phase === "gravando" || showDetails ? (<>
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

          {d.direcao ? <DirectionCard d={d.direcao} /> : null}

          <Section>Cenas sugeridas / B-roll</Section>
          <Card>
            {d.recording_suggestions.map((r, i) => <Text key={i} style={s.body}>• {r.scene} ({r.duration_seconds}s){r.location_hint ? ` — ${r.location_hint}` : ""}</Text>)}
          </Card>

          </>) : null}
          {phase === "gravando" && !showCaption ? (
            <Button variant="ghost" label="📋 Legenda para postar (ver)" onPress={() => setShowCaption(true)} testID="show-caption" />
          ) : (
            <>
              <Section>Legenda para postar</Section>
              <View style={s.row}>
                {PLATFORMS.map((p) => <Chip key={p} label={PLATFORM_LABEL[p]} selected={platform === p} onPress={() => { setPlatform(p); setCopied(null); }} testID={`platform-${p}`} />)}
              </View>
              <Card style={{ gap: 10 }} testID="caption-card">
                <Text style={s.body} selectable testID="caption-text">{d.caption[platform]}</Text>
                <Button compact label={copied === platform ? "LEGENDA COPIADA ✓" : `COPIAR LEGENDA ${PLATFORM_LABEL[platform].toUpperCase()}`} onPress={() => copy(platform, d.caption[platform])} testID="copy-caption" />
              </Card>
            </>
          )}
          </>)}

          {phase !== "gravando" && (autoMsg || job?.status === "failed" || job?.status === "queued" || job?.status === "rendering") ? (
            <Text style={{ color: job?.status === "failed" ? colors.bad : colors.info, fontWeight: "700" }} testID="render-status-line">
              {job?.status === "failed" ? `A montagem falhou: ${job.error ?? "erro"}` : job?.status === "queued" ? "Na fila de montagem — pode sair desta tela." : job?.status === "rendering" ? "Montando o vídeo…" : autoMsg}
            </Text>
          ) : null}
          {parts && phase !== "gravando" && showDetails ? (
            <>
              {parts.plan ? (
                <Card testID="edit-plan" style={{ gap: 4 }}>
                  <Text style={{ fontWeight: "900", color: colors.ink }}>{`Edição automática pronta · ${Math.round(parts.plan.totalMs / 1000)}s · retoque leve incluído`}</Text>
                  {parts.plan.clips.map((c) => (
                    <Text key={c.segmentIndex} style={s.muted}>{c.segmentIndex + 1}. {EFFECT_LABEL[c.effect.kind]} · {(c.durationMs / 1000).toFixed(1)}s · {c.captions.length} {c.captions.length === 1 ? "legenda" : "legendas"}</Text>
                  ))}
                  <Text style={s.muted}>{`Assinatura ${parts.plan.signature}${parts.plan.watermark && parts.plan.watermark !== "off" ? ` (no canto: ${WATERMARK_LABEL[parts.plan.watermark].slice(2)})` : ""}. A montagem (juntar, efeitos, legenda da sua fala e música) roda no servidor de edição.`}</Text>
                  {finalUri ? (
                    <>
                      <Button compact label="VER VÍDEO FINAL / POSTAR" onPress={() => router.push(`/final/${c.id}`)} testID="open-final" />
                      <Button compact variant="secondary" label="REFAZER COM ESTAS OPÇÕES" loading={busy === "montar"} onPress={() => run("montar", async () => {
                        const r = await requestFinalRender(c.workspaceId, c.id, parts.plan!);
                        if (!r.ok) throw new Error(r.reason);
                        setFinalUri(null);
                      })} />
                      {canShort ? (
                        short.uri ? (
                          <Button compact variant="secondary" label="VER VERSÃO CURTA / POSTAR" onPress={() => router.push({ pathname: "/final/[id]", params: { id: c.id, v: "curto" } })} testID="open-short" />
                        ) : short.job && (short.job.status === "queued" || short.job.status === "rendering") ? (
                          <Text style={{ color: colors.info, fontWeight: "800" }}>Montando a versão curta…</Text>
                        ) : (
                          <>
                            {short.job?.status === "failed" ? <Text style={{ color: colors.bad }}>A versão curta falhou: {short.job.error}</Text> : null}
                            <Button compact variant="secondary" label="GERAR VERSÃO CURTA (gancho + virada + chamada)" loading={busy === "curta"} testID="request-short" onPress={() => run("curta", async () => {
                              const r = await requestFinalRender(c.workspaceId, c.id, parts.plan!, "curto");
                              if (!r.ok) throw new Error(r.reason);
                            })} />
                          </>
                        )
                      ) : null}
                    </>
                  ) : job?.status === "done" && dlFailedJob !== job.id ? (
                    <Text style={{ color: colors.info, fontWeight: "800" }}>Vídeo pronto! Baixando para o celular…</Text>
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
                      {!job && !jobKnown ? <Text style={s.muted}>Sem internet: a montagem começa sozinha quando a conexão voltar.</Text> : null}
                      <Button compact label="MELHORAR E FINALIZAR (retoque + legenda + música)" loading={busy === "montar"} testID="request-final" onPress={() => run("montar", async () => {
                        const r = await requestFinalRender(c.workspaceId, c.id, parts.plan!);
                        if (!r.ok) throw new Error(r.reason);
                      })} />
                    </>
                  )}
                  {autoMsg ? <Text style={{ color: colors.info, fontWeight: "700" }} testID="auto-render-status">{autoMsg}</Text> : null}
                  {describeResult(result ?? job?.result) ? <Text style={{ color: colors.good, fontWeight: "700" }}>{describeResult(result ?? job?.result)}</Text> : null}
                  {(result ?? job?.result)?.warnings?.map((w) => <Text key={w} style={{ color: colors.warn, fontWeight: "700" }}>{`⚠ ${w}`}</Text>)}
                  <Text style={s.label}>Quer mudar algo? Escolha e toque em REFAZER.</Text>
                  <FinishOptions value={c.edit} pillarSlug={c.pillarSlug} business={business} workspaceId={workspace?.cloud ? c.workspaceId : undefined} onChange={(v) => void setEditChoices(c.id, v).then(setC)} />
                </Card>
              ) : null}
            </>
          ) : null}

          {phase === "gravando" || showDetails ? <Section>{`Takes deste conteúdo (${takes.length})`}</Section> : null}
          {(phase === "gravando" || showDetails ? takes : []).map((t) => (
            <Card key={t.id}>
              <Text style={{ fontWeight: "700", color: colors.ink }} onPress={() => router.push(`/take/${t.id}`)} accessibilityRole="link">
                Take de {new Date(t.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} · {Math.round(t.media.sizeBytes / 1_048_576)} MB
              </Text>
            </Card>
          ))}

          {/* números só depois de publicar */}
          {finalUri && published ? <MetricsCard content={c} onSaved={setC} /> : null}

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

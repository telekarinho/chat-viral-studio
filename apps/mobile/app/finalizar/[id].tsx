import { useCallback, useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useKeepAwake } from "expo-keep-awake";
import { DEFAULT_EDIT_CHOICES, applyEditProposal, nextTask, ownMusicUuid, toLocalDateKey, type EditChoices, type RecordingTask, type Retouch } from "@postai/domain";
import { chosenTrack, nextTrack } from "../../src/musicChoice";
import { getContent, getTake, listTasks, setEditChoices, type ContentItem, type Take } from "../../src/db/repo";
import { contentPlan, type ContentPlan } from "../../src/finalPlan";
import { downloadFinal, kickRenderWorker, latestRenderJob, requestFinalRender, type RenderJob } from "../../src/finalRender";
import { MusicPreview } from "../../src/components/MusicPreview";
import { FinishOptions } from "../../src/components/FinishOptions";
import { DirectorProposal } from "../../src/components/DirectorProposal";
import { decideEditProposal, pullEditProposal, type PendingProposal, type ProposalDecision } from "../../src/editProposals";
import { useApp } from "../../src/app-state";
import { setContentOnScreen } from "../../src/renderWatch";
import { syncNow } from "../../src/sync/engine";
import { reportError } from "../../src/telemetry";
import { Button, Card, Eyebrow, H1, Loading, Screen, colors, s } from "../../src/ui";

const POLL_MS = 8_000;
const CAPTION_NAME: Record<string, string> = { manuscrito: "Manuscrito (creme, pincel)", destaque: "Destaque (palavra acende)", limpo: "Limpa", nenhuma: "Sem legenda" };
const RETOUCH_NAME: Record<Retouch, string> = { forte: "Forte", leve: "Natural", off: "Desligado" };

type Step = "confirmar" | "enviando" | "fila" | "montando" | "baixando" | "falhou";

/**
 * Fim do fluxo, tudo numa tela: o app já escolheu cortes, legenda, música e embelezamento; a pessoa só
 * confirma. Depois mostra o andamento (enviando → montando → pronto) e abre o vídeo final sozinho.
 */
export default function FinalizarScreen() {
  useKeepAwake();
  // refazer=1: veio do vídeo pronto ("TROCAR MÚSICA E REFAZER") — monta de novo sem perguntar
  const { id, refazer } = useLocalSearchParams<{ id: string; refazer?: string }>();
  const [c, setC] = useState<ContentItem | null>(null);
  const [cp, setCp] = useState<ContentPlan | null>(null);
  const { workspace } = useApp();
  const [takes, setTakes] = useState<Take[]>([]);
  const [job, setJob] = useState<RenderJob | null>(null);
  const [confirmed, setConfirmed] = useState(refazer === "1");
  const [waitMsg, setWaitMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showOptions, setShowOptions] = useState(false);
  const [proposal, setProposal] = useState<PendingProposal | null>(null);
  const opening = useRef(false);
  const retryAsked = useRef(false);
  // pedir montagem nova mesmo que já exista um vídeo pronto (confirmar de novo / refazer)
  const forceRequest = useRef(refazer === "1");
  // enquanto monta, dá para seguir gravando: próxima missão pendente de hoje (outra que não esta)
  const [next, setNext] = useState<RecordingTask | null>(null);
  useEffect(() => {
    void listTasks(toLocalDateKey(new Date())).then((ts) => setNext(nextTask(ts.filter((t) => t.contentItemId !== id), new Date()))).catch(() => undefined);
  }, [id]);
  // há quanto tempo está na etapa atual (atualiza a cada 30 s)
  const phaseKey = `${confirmed}:${job?.status ?? ""}`;
  const [since, setSince] = useState(() => Date.now());
  const [, setTick] = useState(0);
  useEffect(() => setSince(Date.now()), [phaseKey]);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  const mins = Math.floor((Date.now() - since) / 60_000);
  const stepSince = mins >= 1 ? `${mins} min` : "";

  const refresh = useCallback(async () => {
    const item = await getContent(id);
    setC(item);
    if (!item) return;
    const plan = await contentPlan(item);
    setCp(plan);
    setTakes((await Promise.all((plan?.takes ?? []).map((t) => getTake(t.id)))).filter((t): t is Take => Boolean(t)));
    // sugestão do diretor (Claude) para esta montagem, se houver
    if (plan) void pullEditProposal(item.workspaceId, item.id, plan.business).then(setProposal).catch(() => undefined);
    try {
      const j = await latestRenderJob(item.id);
      setJob(j);
      // já tinha montagem pedida (voltou para a tela): segue acompanhando
      if (j && (j.status === "queued" || j.status === "rendering")) setConfirmed(true);
    } catch {
      setWaitMsg("Sem internet agora: a montagem começa quando a conexão voltar.");
    }
  }, [id]);
  useFocusEffect(useCallback(() => void refresh().catch((e) => setError(String(e))), [refresh]));
  // esta tela já acompanha e abre o vídeo: sem aviso duplicado enquanto ela está aberta
  useFocusEffect(useCallback(() => {
    setContentOnScreen(id);
    return () => setContentOnScreen(null);
  }, [id]));

  // depois de confirmar: pede a montagem (espera os vídeos subirem) e acompanha até ficar pronta
  // o acompanhamento lê o conteúdo/plano mais recentes por ref: o refresh de cada volta NÃO pode reiniciar o
  // acompanhamento (antes reiniciava e cancelava a própria volta antes de pedir a montagem)
  const latest = useRef({ c, plan: cp?.plan ?? null });
  latest.current = { c, plan: cp?.plan ?? null };
  const ready = confirmed && Boolean(c && cp?.plan);
  useEffect(() => {
    if (!ready) return;
    let stop = false;
    const tick = async () => {
      void syncNow();
      await refresh();
      const { c, plan } = latest.current;
      if (stop || !c || !plan) return;
      const j = await latestRenderJob(c.id).catch(() => null);
      if (stop) return;
      // falhou: só pede de novo quando a pessoa toca em TENTAR DE NOVO (sem loop de pedidos)
      if (!j || forceRequest.current || (j.status === "failed" && retryAsked.current)) {
        retryAsked.current = false;
        const r = await requestFinalRender(c.workspaceId, c.id, plan);
        if (r.ok) {
          // só esquece o "refazer" quando o pedido novo entrou (vídeos ainda subindo = tenta na próxima volta)
          forceRequest.current = false;
          setWaitMsg(null);
          void kickRenderWorker();
          setJob(await latestRenderJob(c.id).catch(() => null));
        } else setWaitMsg(r.reason);
      } else if (j.status === "done" && !opening.current) {
        opening.current = true;
        try {
          await downloadFinal(c.id, j);
          router.replace(`/final/${c.id}`);
        } catch (e) {
          opening.current = false;
          setWaitMsg(`O vídeo ficou pronto; baixando de novo… (${e instanceof Error ? e.message : String(e)})`);
        }
      }
    };
    void tick().catch((e) => reportError(e, "finalizar"));
    const t = setInterval(() => void tick().catch((e) => reportError(e, "finalizar")), POLL_MS);
    return () => { stop = true; clearInterval(t); };
  }, [ready, refresh]);

  if (!c || !cp) return <Screen><Loading label="Preparando a montagem…" /></Screen>;
  if (!cp.plan) {
    return (
      <Screen testID="finalizar-screen">
        <H1>Faltam partes</H1>
        <Text style={s.body}>{`Gravadas ${cp.recorded.length} de ${cp.segments.length}. Grave as que faltam e volte aqui.`}</Text>
        <Button label="CONTINUAR GRAVANDO" onPress={() => router.replace({ pathname: "/record", params: { contentId: c.id, partes: "1" } })} />
      </Screen>
    );
  }

  const edit: EditChoices = c.edit ?? { ...DEFAULT_EDIT_CHOICES, retouch: cp.business ? "leve" : "forte" };
  const retouch = edit.retouch ?? (cp.business ? "leve" : "forte");
  const track = chosenTrack(edit, c.id, c.pillarSlug, cp.business, c.draft?.direcao);
  // automática sem faixa da direção: o servidor escolhe na montagem (não repete as últimas do perfil)
  const autoPick = edit.music === "auto" && !c.draft?.direcao?.musica;
  const save = (v: EditChoices) => void setEditChoices(c.id, v).then(setC);
  const decide = async (d: ProposalDecision) => {
    const p = proposal;
    setProposal(null);
    if (!p) return;
    // a escolha fica salva no aparelho antes de pedir a montagem (o servidor monta pelo que o app manda)
    if (d !== "dispensar") setC(await setEditChoices(c.id, applyEditProposal(edit, p.edit)));
    void decideEditProposal(c.id, d).catch((e) => reportError(e, "proposta do diretor"));
    if (d === "montar") { forceRequest.current = true; setConfirmed(true); }
    if (d === "ajustar") setShowOptions(true);
  };
  const uploaded = takes.filter((t) => t.media.state === "uploaded_original").length;
  const allUp = takes.length > 0 && uploaded === takes.length;
  const step: Step = !confirmed ? "confirmar"
    : job?.status === "failed" && !waitMsg ? "falhou"
    : job?.status === "done" ? "baixando"
    : job?.status === "rendering" ? "montando"
    : job?.status === "queued" ? "fila"
    : "enviando";

  return (
    <Screen testID="finalizar-screen">
      <Eyebrow>{c.draft?.title ?? c.title}</Eyebrow>
      <H1>{step === "confirmar" ? "Seu vídeo vai sair assim" : "Montando seu vídeo"}</H1>

      {step === "confirmar" ? (
        <>
          {proposal ? <DirectorProposal proposal={proposal} onDecide={(d) => void decide(d).catch((e) => setError(String(e)))} /> : null}
          <Card style={{ gap: 10 }} testID="final-summary">
            <Row label={`✓ ${cp.plan.clips.length} parte(s) juntas, ~${Math.round(cp.plan.totalMs / 1000)}s`} />
            <Row label={`✓ Cortar erros, pausas e repetições${edit.autoCut === false ? " (desligado)" : ""}`} />
            <Row label={`✓ Legenda: ${CAPTION_NAME[edit.captionStyle] ?? edit.captionStyle}`} />
            <Row label={ownMusicUuid(edit.music) ? "✓ Música: a sua (enviada por você)"
              : autoPick ? "✓ Música: automática (escolhida na montagem, sem repetir as últimas)"
                : track ? `✓ Música: ${track.title} — ${track.artist}` : "✓ Sem música"}
              action={track ? { label: "TROCAR", onPress: () => save({ ...edit, music: nextTrack(track).id }), testID: "swap-music" } : undefined} />
            {track && !autoPick ? (
              <MusicPreview track={track} volume={edit.musicVolume ?? c.draft?.direcao?.musica?.volume ?? DEFAULT_EDIT_CHOICES.musicVolume ?? 0.22}
                entradaS={edit.music === "auto" && c.draft?.direcao?.musica?.id === track.id ? c.draft.direcao.musica.entrada : 0}
                voiceUri={takes.find((t) => t.id === cp.plan!.clips[0]?.takeId)?.media.localUri ?? null} />
            ) : null}
            <Row label={`✓ Embelezar a pele: ${RETOUCH_NAME[retouch]}`} />
            <Row label={`✓ Voz limpa, gancho na tela, capa e assinatura`} />
          </Card>
          <Button label="CONFIRMAR E MONTAR" onPress={() => { forceRequest.current = true; setConfirmed(true); }} testID="confirm-render" />
          <Button variant="ghost" compact label={showOptions ? "Fechar opções" : "Mudar alguma coisa"} onPress={() => setShowOptions(!showOptions)} testID="change-options" />
          {showOptions ? <FinishOptions value={edit} onChange={save} pillarSlug={c.pillarSlug} business={cp.business} workspaceId={workspace?.cloud ? c.workspaceId : undefined} contentId={c.id} direction={c.draft?.direcao}
            voiceUri={takes.find((t) => t.id === cp.plan!.clips[0]?.takeId)?.media.localUri ?? null} /> : null}
        </>
      ) : (
        <Card style={{ gap: 12 }} testID="render-progress">
          <StepRow n={1} label="Partes gravadas" state="ok" />
          <StepRow n={2} label={allUp ? "Vídeos na nuvem" : `Enviando para a nuvem (${uploaded}/${takes.length})`} state={allUp ? "ok" : "now"} />
          <StepRow n={3} label={step === "fila" ? "Na fila do servidor de edição" : "Editando: cortes, legenda, música e embelezar"}
            state={step === "montando" || step === "fila" ? "now" : step === "baixando" ? "ok" : "todo"} />
          <StepRow n={4} label="Pronto para postar" state={step === "baixando" ? "now" : "todo"} />
          {waitMsg ? <Text style={s.muted}>{waitMsg}</Text> : null}
          {step === "falhou" ? (
            <>
              <Text style={{ color: colors.bad, fontWeight: "700" }}>{`A montagem falhou: ${job?.error ?? "erro no servidor"}`}</Text>
              <Button label="TENTAR DE NOVO" onPress={() => { retryAsked.current = true; setJob(null); setWaitMsg("Pedindo de novo…"); }} testID="retry-render" />
            </>
          ) : (
            <Text style={s.muted}>{`${etaText(step)}${stepSince ? ` · há ${stepSince}` : ""}. Pode sair desta tela: aviso no celular quando ficar pronto.`}</Text>
          )}
        </Card>
      )}
      {step !== "confirmar" && step !== "baixando" ? (
        // não precisa esperar: a montagem continua no servidor e o aviso chega quando ficar pronta
        <View style={{ gap: 8 }}>
          {next ? (
            <Button label={`▶ GRAVAR O PRÓXIMO: ${next.title} (${hhmm(next.scheduledFor)})`} testID="record-next"
              onPress={() => router.replace({ pathname: "/record", params: { taskId: next.id, contentId: next.contentItemId ?? "" } })} />
          ) : null}
          <Button variant="secondary" label="VOLTAR PARA HOJE" onPress={() => router.replace("/")} testID="back-today-from-render" />
        </View>
      ) : null}
      {error ? <Text style={{ color: colors.bad }}>{error}</Text> : null}
    </Screen>
  );
}

/** Tempo esperado em cada etapa (o servidor de edição acorda a cada pedido; a montagem leva alguns minutos). */
function etaText(step: Step): string {
  if (step === "enviando") return "Enviando os vídeos — depende da internet";
  if (step === "fila") return "Na fila — o servidor começa em até ~5 min";
  if (step === "montando") return "Editando — leva uns 3 a 6 minutos";
  return "Quase lá";
}

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

function Row({ label, action }: { label: string; action?: { label: string; onPress: () => void; testID?: string } }) {
  return (
    <View style={[s.row, { justifyContent: "space-between", alignItems: "center", gap: 8 }]}>
      <Text style={[s.body, { flex: 1 }]}>{label}</Text>
      {action ? <Button compact variant="secondary" label={action.label} onPress={action.onPress} testID={action.testID} /> : null}
    </View>
  );
}

function StepRow({ n, label, state }: { n: number; label: string; state: "ok" | "now" | "todo" }) {
  const color = state === "ok" ? colors.good : state === "now" ? colors.info : colors.muted;
  return (
    <View style={[s.row, { alignItems: "center", gap: 10 }]} testID={`render-step-${n}`}>
      <Text style={{ color, fontWeight: "900", width: 24 }}>{state === "ok" ? "✓" : state === "now" ? "●" : `${n}`}</Text>
      <Text style={{ color: state === "todo" ? colors.muted : colors.ink, fontWeight: state === "now" ? "800" : "600", flex: 1 }}>{label}</Text>
    </View>
  );
}
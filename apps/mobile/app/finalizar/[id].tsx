import { useCallback, useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useKeepAwake } from "expo-keep-awake";
import {
  DEFAULT_EDIT_CHOICES, MOOD_LABEL, MUSIC_LIBRARY, moodForPillar, pickTrack, trackById,
  type EditChoices, type MusicMood, type MusicTrack, type Retouch,
} from "@postai/domain";
import { getContent, getTake, setEditChoices, type ContentItem, type Take } from "../../src/db/repo";
import { contentPlan, type ContentPlan } from "../../src/finalPlan";
import { downloadFinal, kickRenderWorker, latestRenderJob, requestFinalRender, type RenderJob } from "../../src/finalRender";
import { FinishOptions } from "../../src/components/FinishOptions";
import { setContentOnScreen } from "../../src/renderWatch";
import { syncNow } from "../../src/sync/engine";
import { reportError } from "../../src/telemetry";
import { Button, Card, Eyebrow, H1, Loading, Screen, colors, s } from "../../src/ui";

const POLL_MS = 8_000;
const CAPTION_NAME: Record<string, string> = { manuscrito: "Manuscrito (creme, pincel)", destaque: "Destaque (palavra acende)", limpo: "Limpa", nenhuma: "Sem legenda" };
const RETOUCH_NAME: Record<Retouch, string> = { forte: "Forte", leve: "Natural", off: "Desligado" };

/** A música que vai entrar (o servidor escolhe igual: mesmo clima e mesma semente = mesma faixa). */
function chosenTrack(edit: EditChoices, contentId: string, pillarSlug: string, business: boolean): MusicTrack | null {
  if (edit.music === "none") return null;
  const exact = trackById(edit.music);
  if (exact) return exact;
  const mood = (edit.music in MOOD_LABEL ? edit.music : moodForPillar(pillarSlug, business)) as MusicMood;
  return pickTrack(mood, contentId);
}

/** Próxima faixa do mesmo clima (botão TROCAR). */
function nextTrack(current: MusicTrack): MusicTrack {
  const pool = MUSIC_LIBRARY.filter((t) => t.mood === current.mood);
  return pool[(pool.findIndex((t) => t.id === current.id) + 1) % pool.length]!;
}

type Step = "confirmar" | "enviando" | "fila" | "montando" | "baixando" | "falhou";

/**
 * Fim do fluxo, tudo numa tela: o app já escolheu cortes, legenda, música e embelezamento; a pessoa só
 * confirma. Depois mostra o andamento (enviando → montando → pronto) e abre o vídeo final sozinho.
 */
export default function FinalizarScreen() {
  useKeepAwake();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [c, setC] = useState<ContentItem | null>(null);
  const [cp, setCp] = useState<ContentPlan | null>(null);
  const [takes, setTakes] = useState<Take[]>([]);
  const [job, setJob] = useState<RenderJob | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [waitMsg, setWaitMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showOptions, setShowOptions] = useState(false);
  const opening = useRef(false);
  const retryAsked = useRef(false);

  const refresh = useCallback(async () => {
    const item = await getContent(id);
    setC(item);
    if (!item) return;
    const plan = await contentPlan(item);
    setCp(plan);
    setTakes((await Promise.all((plan?.takes ?? []).map((t) => getTake(t.id)))).filter((t): t is Take => Boolean(t)));
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
      if (!j || (j.status === "failed" && retryAsked.current)) {
        retryAsked.current = false;
        const r = await requestFinalRender(c.workspaceId, c.id, plan);
        if (r.ok) {
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
  const track = chosenTrack(edit, c.id, c.pillarSlug, cp.business);
  const save = (v: EditChoices) => void setEditChoices(c.id, v).then(setC);
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
          <Card style={{ gap: 10 }} testID="final-summary">
            <Row label={`✓ ${cp.plan.clips.length} parte(s) juntas, ~${Math.round(cp.plan.totalMs / 1000)}s`} />
            <Row label={`✓ Cortar erros, pausas e repetições${edit.autoCut === false ? " (desligado)" : ""}`} />
            <Row label={`✓ Legenda: ${CAPTION_NAME[edit.captionStyle] ?? edit.captionStyle}`} />
            <Row label={track ? `✓ Música: ${track.title} — ${track.artist}` : "✓ Sem música"}
              action={track ? { label: "TROCAR", onPress: () => save({ ...edit, music: nextTrack(track).id }), testID: "swap-music" } : undefined} />
            <Row label={`✓ Embelezar a pele: ${RETOUCH_NAME[retouch]}`} />
            <Row label={`✓ Voz limpa, gancho na tela, capa e assinatura`} />
          </Card>
          <Button label="CONFIRMAR E MONTAR" onPress={() => setConfirmed(true)} testID="confirm-render" />
          <Button variant="ghost" compact label={showOptions ? "Fechar opções" : "Mudar alguma coisa"} onPress={() => setShowOptions(!showOptions)} testID="change-options" />
          {showOptions ? <FinishOptions value={edit} onChange={save} pillarSlug={c.pillarSlug} business={cp.business} /> : null}
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
            <Text style={s.muted}>Pode sair desta tela: aviso no celular quando ficar pronto.</Text>
          )}
        </Card>
      )}
      {error ? <Text style={{ color: colors.bad }}>{error}</Text> : null}
    </Screen>
  );
}

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

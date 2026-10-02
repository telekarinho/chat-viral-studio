import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useKeepAwake } from "expo-keep-awake";
import { useVideoPlayer, VideoView } from "expo-video";
import * as Brightness from "expo-brightness";
import { Camera, useCameraDevice, useCameraPermission, useMicrophonePermission, type VideoFile } from "react-native-vision-camera";
import {
  DEFAULT_EDIT_CHOICES, PRESET_LABEL, PRODUCTION_MODES, RECORDING_CHECKLIST, RECORDING_TIPS, SHOT_LIBRARY, availablePresets, buildSegments, initialTeleprompter, isBusiness, type ProjectInfo, type ShotKey, pickFormat, segmentProgress, supportedFps, teleprompterReducer,
  type ResolutionPreset, type Retouch, type ScriptSegment,
} from "@postai/domain";
import { getContent, getTask, latestTakesBySegment, registerTake, requireWorkspace, queuePatrimonio, runTaskAction, setEditChoices, workspaceById, updateSettings, updateTakeMeta, type ContentItem, type Take } from "../src/db/repo";
import { freeDiskBytes, persistRecording } from "../src/media";
import { newId } from "../src/config";
import { syncNow } from "../src/sync/engine";
import { reportError } from "../src/telemetry";
import { Teleprompter } from "../src/components/Teleprompter";
import { Button, Loading, Screen, colors, s } from "../src/ui";

type Phase = "ready" | "recording" | "saving" | "saved" | "error";
const LOW_DISK = 500 * 1024 * 1024;
// Mbps. 1080p@5 ≈ 37 MB/min: fits Supabase Free's 50 MB/file for takes up to ~1 min; parts are shorter.
const VIDEO_MBPS: Record<ResolutionPreset, number> = { "1080p": 5, "2k": 9, "4k": 16 };

export default function RecordScreen() {
  useKeepAwake();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ taskId?: string; contentId?: string; prompter?: string; partes?: string; ordem?: string; clipe?: string; instrucao?: string }>();
  // Gravar patrimônio: real footage for a MMIX factory order clip (rear camera, no speech)
  const patrimonio = params.ordem ? { ordem: Number(params.ordem), clipe: Number(params.clipe || 1) } : null;
  const taskId = params.taskId || null;
  const contentId = params.contentId || null;
  const cam = useCameraPermission();
  const mic = useMicrophonePermission();
  const [position, setPosition] = useState<"front" | "back">(patrimonio ? "back" : "front");
  const device = useCameraDevice(position);
  const [preset, setPreset] = useState<ResolutionPreset>("1080p");
  const [fps, setFps] = useState(30);
  // "Luz": front = screen ring light (bright frame + max brightness), back = torch
  const [light, setLight] = useState<LightMode>("off");
  const winW = useWindowDimensions().width;
  const [prompterOn, setPrompterOn] = useState(params.prompter === "1" || params.partes === "1" || Boolean(params.instrucao));
  // gravação por partes: only the current part is on the teleprompter; recorded parts disappear
  const [segments, setSegments] = useState<ScriptSegment[] | null>(null);
  const [segIndex, setSegIndex] = useState<number | null>(null);
  const [recordedParts, setRecordedParts] = useState<number[]>([]);
  const [script, setScript] = useState("");
  // estúdio: equipamento filmado e tomada atual (vão nos metadados do clipe)
  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [shot, setShot] = useState<ShotKey | null>(null);
  const [category, setCategory] = useState("livre");
  const [tp, dispatch] = useReducer(teleprompterReducer, initialTeleprompter);
  // embelezamento da pele: escolhido aqui, aplicado na montagem do vídeo final
  const [content, setContent] = useState<ContentItem | null>(null);
  const [retouch, setRetouch] = useState<Retouch>("forte");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showScene, setShowScene] = useState(false);
  const [phase, setPhase] = useState<Phase>("ready");
  const [message, setMessage] = useState<string | null>(null);
  const [saved, setSaved] = useState<Take | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const camera = useRef<Camera>(null);
  const pendingStart = useRef(false);

  useEffect(() => {
    (async () => {
      const ws = await requireWorkspace();
      setPreset(ws.settings.resolution);
      setFps(ws.settings.fps);
      const t = ws.settings.teleprompter;
      dispatch({ type: "setFontSize", value: t.fontSize });
      dispatch({ type: "setSpeed", value: t.speed });
      dispatch({ type: "setCountdown", seconds: t.countdownSeconds });
      if (t.mirrored) dispatch({ type: "toggleMirror" });
      const task = taskId ? await getTask(taskId) : null;
      const content = contentId ? await getContent(contentId) : null;
      setCategory(params.ordem ? "patrimonio" : task?.kind ?? content?.format ?? "livre");
      if (params.instrucao) setScript(params.instrucao);
      if (content) {
        setContent(content);
        const business = isBusiness((await workspaceById(content.workspaceId)).profile);
        setRetouch(content.edit?.retouch ?? (business ? "leve" : "forte"));
      }
      if (content?.project) {
        setProject(content.project);
        setShot(PRODUCTION_MODES[content.project.mode].shots[0] ?? null);
      }
      if (content?.draft && params.partes === "1") {
        const owner = await workspaceById(content.workspaceId);
        const segs = buildSegments(content.draft, { selectedHook: content.selectedHook ?? 0, userEdited: Boolean(content.meta?.userEdited), closingPhrase: owner.profile.closingPhrase, business: isBusiness(owner.profile) });
        const recorded = [...(await latestTakesBySegment(content.id)).keys()];
        const next = segmentProgress(segs.length, recorded).next ?? 0;
        setSegments(segs);
        setRecordedParts(recorded);
        setSegIndex(next);
        setScript(segs[next]?.text ?? "");
      } else if (content?.draft) {
        const hook = content.draft.hook_options[content.selectedHook ?? 0];
        setScript(hook && !content.draft.script.startsWith(hook) ? `${hook}\n\n${content.draft.script}` : content.draft.script);
      } else if (task) {
        setScript(`${task.title}${task.hint ? `\n\n${task.hint}` : ""}`);
      }
    })().catch((e) => reportError(e, "record init"));
  }, [taskId, contentId, params.partes, params.ordem, params.instrucao]);

  useEffect(() => {
    if (light === "off" || position !== "front") return;
    let previous: number | null = null;
    Brightness.getBrightnessAsync()
      .then((b) => {
        previous = b;
        return Brightness.setBrightnessAsync(1);
      })
      .catch((e) => reportError(e, "brightness"));
    return () => {
      if (previous !== null) void Brightness.setBrightnessAsync(previous).catch(() => undefined);
    };
  }, [light, position]);

  useEffect(() => {
    if (!cam.hasPermission) void cam.requestPermission();
    if (!mic.hasPermission) void mic.requestPermission();
  }, [cam, mic]);

  const formats = device?.formats ?? [];
  const presets = availablePresets(formats);
  const format = device ? pickFormat(formats, presets.includes(preset) ? preset : "1080p", fps) : null;
  const fpsOptions = supportedFps(format);
  const effectiveFps = fpsOptions.includes(fps) ? fps : 30;

  useEffect(() => {
    if (phase !== "recording") return;
    const started = Date.now();
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 500);
    return () => clearInterval(t);
  }, [phase]);

  const onFinished = useCallback(async (video: VideoFile) => {
    setPhase("saving");
    try {
      const mediaId = newId();
      const file = persistRecording(video.path, mediaId);
      const take = await registerTake({
        mediaId, localUri: file.uri, sizeBytes: file.sizeBytes, checksum: file.checksum, width: video.width ?? null, height: video.height ?? null,
        durationMs: Math.round((video.duration ?? 0) * 1000), taskId, contentItemId: contentId, category, camera: position, segmentIndex: segIndex,
        meta: project ? {
          shot, capitulo: segIndex !== null ? segments?.[segIndex]?.label ?? null : shot ? SHOT_LIBRARY[shot].label : null,
          // tempo de preparo REGISTRADO nesta demonstração (referência, nunca promessa)
          tempoPreparoSeg: shot === "preparo" ? Math.round(video.duration ?? 0) : null,
        } : undefined,
      });
      if (segIndex !== null) setRecordedParts((r) => [...new Set([...r, segIndex])]);
      setSaved(take);
      setPhase("saved");
      void syncNow();
    } catch (e) {
      reportError(e, "persist recording");
      setMessage(`Não consegui salvar o vídeo: ${e instanceof Error ? e.message : String(e)}`);
      setPhase("error");
    }
  }, [taskId, contentId, category, position, segIndex, project, shot, segments]);

  const beginRecording = useCallback(() => {
    if (!camera.current) return;
    setElapsed(0);
    setPhase("recording");
    camera.current.startRecording({
      fileType: "mp4",
      onRecordingFinished: (v) => void onFinished(v),
      onRecordingError: (e) => {
        reportError(e, "recording");
        setMessage(`A gravação falhou: ${e.message}`);
        setPhase("error");
      },
    });
  }, [onFinished]);

  // countdown finished → start recording (countdown lives in the teleprompter reducer)
  useEffect(() => {
    if (pendingStart.current && tp.phase === "running") {
      pendingStart.current = false;
      beginRecording();
    }
  }, [tp.phase, beginRecording]);

  function onRecordPress() {
    if (phase === "recording") {
      dispatch({ type: "pause" });
      void camera.current?.stopRecording();
      return;
    }
    if (freeDiskBytes() < LOW_DISK) setMessage("Pouco espaço no celular (<500 MB). Grave takes curtos.");
    pendingStart.current = true;
    dispatch({ type: "restart" });
    dispatch({ type: "start" });
  }

  async function attachAndDone() {
    if (!saved) return;
    try {
      if (taskId) {
        const t = await getTask(taskId);
        if (t?.status === "pending") await runTaskAction(taskId, { type: "done", takeId: saved.id });
      }
      if (patrimonio) {
        await queuePatrimonio(saved.id, patrimonio.ordem, patrimonio.clipe);
        void syncNow();
      }
      // gravou tudo de um conteúdo com roteiro: vai direto para "Seu vídeo vai sair assim" (só confirmar)
      if (contentId && !project && !patrimonio) router.replace(`/finalizar/${contentId}`);
      else if (contentId) router.replace(`/content/${contentId}`);
      else router.back();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
  }

  function savePrefs(patch: { resolution?: ResolutionPreset; fps?: number }) {
    void updateSettings(patch);
  }

  if (!cam.hasPermission) {
    return (
      <Screen>
        <Text style={s.body}>Preciso da permissão da câmera para gravar.</Text>
        <Button label="PERMITIR CÂMERA" onPress={() => void cam.requestPermission()} />
        <Button variant="ghost" label="Voltar" onPress={() => router.back()} />
      </Screen>
    );
  }
  if (!device) return <Screen><Loading label="Abrindo a câmera…" /></Screen>;

  function goToPart(i: number) {
    if (!segments?.[i]) return;
    setSegIndex(i);
    setScript(segments[i].text);
    setSaved(null);
    setMessage(null);
    setPhase("ready");
    dispatch({ type: "restart" });
  }

  /** "Ficou ruim": keep the file (never lose footage) but take it out of the edit, then record again. */
  async function discardAndRetake(take: Take, part: number | null) {
    await updateTakeMeta(take.id, { tags: [...take.tags, "descartado"] });
    if (part !== null) setRecordedParts((r) => r.filter((i) => i !== part));
    if (part !== null) goToPart(part);
    else {
      setSaved(null);
      setPhase("ready");
      dispatch({ type: "restart" });
    }
  }

  if (phase === "saved" && saved && segments && segIndex !== null) {
    const prog = segmentProgress(segments.length, recordedParts);
    return (
      <Screen testID="saved-screen">
        <Text style={{ fontSize: 22, fontWeight: "900", color: colors.good }} testID="saved-local">{`Parte ${segIndex + 1} salva ✓ — assista e decida`}</Text>
        <ReviewPlayer uri={saved.media.localUri} />
        <View style={[s.row, { justifyContent: "space-between" }]}>
          <View style={{ flex: 1 }}>
            {prog.next !== null ? (
              <Button label={`✓ FICOU BOM — PARTE ${prog.next + 1}`} onPress={() => goToPart(prog.next!)} testID="next-part" />
            ) : (
              <Button label="✓ FICOU BOM — CONCLUIR" onPress={attachAndDone} testID="attach-done" />
            )}
          </View>
        </View>
        <Button variant="secondary" label={`↺ GRAVAR DE NOVO A PARTE ${segIndex + 1}`} onPress={() => void discardAndRetake(saved, segIndex)} testID="retake-part" />
        {project ? <StudioNotes take={saved} /> : null}
        <Text style={s.muted}>{`${prog.recorded.length} de ${segments.length} partes boas · ${segments.map((sg) => (prog.recorded.includes(sg.index) ? "✓" : "○")).join(" ")}`}</Text>
      </Screen>
    );
  }

  if (phase === "saved" && saved) {
    return (
      <Screen testID="saved-screen">
        <Text style={{ fontSize: 22, fontWeight: "900", color: colors.good }} testID="saved-local">Salvo no aparelho ✓ — assista e decida</Text>
        <ReviewPlayer uri={saved.media.localUri} />
        <Button label={patrimonio ? "✓ FICOU BOM — ENVIAR PARA A FÁBRICA" : taskId ? "✓ FICOU BOM — MARCAR FEITO" : "✓ FICOU BOM"} onPress={attachAndDone} testID="attach-done" />
        <Button variant="secondary" label="↺ GRAVAR DE NOVO" onPress={() => void discardAndRetake(saved, null)} testID="record-again" />
        {project ? <StudioNotes take={saved} /> : null}
        <Text style={s.muted}>{`${Math.round((saved.media.durationMs ?? 0) / 1000)}s · ${(saved.media.sizeBytes / 1_048_576).toFixed(1)} MB · o original fica guardado no celular e sobe para a nuvem sozinho.`}</Text>
      </Screen>
    );
  }

  const busy = phase === "saving";
  const recording = phase === "recording";
  const ringLight = light !== "off" && position === "front";
  // luz máxima: a câmera vira uma janela oval e o resto da tela é luz pura no rosto (a gravação continua o quadro inteiro)
  const ovalW = Math.round(winW * LIGHT_WINDOW);
  const nextRetouch = (r: Retouch): Retouch => (r === "forte" ? "leve" : r === "leve" ? "off" : "forte");
  function cycleRetouch() {
    if (!content) return;
    const r = nextRetouch(retouch);
    setRetouch(r);
    void setEditChoices(content.id, { ...DEFAULT_EDIT_CHOICES, ...content.edit, retouch: r }).then(setContent).catch((e) => reportError(e, "retouch"));
  }
  const nextCountdown = tp.countdownSeconds === 0 ? 3 : tp.countdownSeconds === 3 ? 5 : 0;
  // dica de gravação da parte atual; antes da 1ª parte, o básico de luz/enquadramento
  const role = segments && segIndex !== null ? segments[segIndex]?.role : null;
  const firstPart = !segments || recordedParts.length === 0;
  // roteiro com direção: a instrução do diretor para ESTE take vem no lugar da dica genérica,
  // curta (como falar) e a cena (onde/como filmar) só ao tocar — não cobre o rosto
  const direction = segments && segIndex !== null ? segments[segIndex]?.direction : undefined;
  const speech = (direction ?? []).filter((d) => SPEECH_LABELS.includes(d.label));
  const scene = (direction ?? []).filter((d) => !SPEECH_LABELS.includes(d.label));
  const join = (xs: { label: string; value: string }[]) => xs.map((d) => `${d.label}: ${d.value}`).join(" · ");
  const tip = direction?.length
    ? (showScene ? `🎥 ${join(scene)}` : `🎙 ${join(speech) || "Fale com calma, olhando para a lente."}`)
    : role && !firstPart ? RECORDING_TIPS[role] : `${RECORDING_CHECKLIST}. ${RECORDING_TIPS[role ?? "hook"]}`;
  return (
    <View style={[st.root, ringLight && { backgroundColor: RING_COLOR[light] }]} testID="record-screen">
      <View style={ringLight ? [st.frame, { width: ovalW, borderRadius: ovalW / 2, marginTop: -80 }] : st.frame}>
        <Camera
          ref={camera}
          style={StyleSheet.absoluteFill}
          device={device}
          format={format ?? undefined}
          fps={effectiveFps}
          videoBitRate={VIDEO_MBPS[presets.includes(preset) ? preset : "1080p"]}
          // estabilização do próprio celular (a melhor que o formato suportar) — ajuda muito gravando andando
          videoStabilizationMode={(["cinematic-extended", "cinematic", "standard", "auto"] as const).find((m) => format?.videoStabilizationModes?.includes(m))}
          isActive={phase !== "saving"}
          video
          audio={mic.hasPermission}
          torch={position === "back" && light !== "off" ? "on" : "off"}
          resizeMode="cover"
        />
        {/* luz de tela estilo TikTok: brilho suave vindo das bordas */}
        {ringLight ? <SoftGlow color={RING_COLOR[light]} /> : null}
      </View>
      {/* abaixo da etiqueta "Parte x/y" (que fica abaixo da ilha/entalhe do celular) */}
      <Teleprompter text={script || "Sem roteiro — fale livremente."} state={tp} dispatch={dispatch} visible={prompterOn} top={insets.top + PROMPTER_GAP_TOP} />
      {tp.phase === "countdown" ? (
        <View style={st.countdown} pointerEvents="none" testID="countdown">
          <Text style={st.countdownText}>{Math.ceil(tp.countdownMs / 1000)}</Text>
        </View>
      ) : null}

      <View style={[st.top, { top: 18 + insets.top }]}>
        <Pressable onPress={() => (recording ? undefined : router.back())} accessibilityRole="button" accessibilityLabel="Fechar" style={st.close} hitSlop={10}>
          <Text style={[st.closeText, ringLight && { color: "#111111", textShadowRadius: 0 }]}>✕</Text>
        </Pressable>
        {recording ? (
          <Text style={st.rec} testID="rec-indicator">{`● REC ${elapsed}s`}</Text>
        ) : segments && segIndex !== null ? (
          <View style={st.topPill}>
            <Text style={st.topPillText} testID="part-indicator" accessible accessibilityRole="header" accessibilityLabel={`Parte ${segIndex + 1} de ${segments.length}, ${segments[segIndex]?.label ?? ""}`}>
              {`Parte ${segIndex + 1}/${segments.length} · ${segments[segIndex]?.label ?? ""}`}
            </Text>
          </View>
        ) : (
          <View style={st.topPill}><Text style={st.topPillText}>{`${PRESET_LABEL[format && presets.includes(preset) ? preset : "1080p"]} · ${effectiveFps}fps`}</Text></View>
        )}
        <View style={{ width: 44 }} />
      </View>

      {/* trilho de botões à direita, como no TikTok: ícone + nome embaixo */}
      {!recording ? (
        <View style={st.rail}>
          <RailButton onLight={ringLight} icon="⟲" label="Virar" onPress={() => setPosition(position === "front" ? "back" : "front")} testID="flip-camera" />
          <RailButton onLight={ringLight} icon="☀" label={LIGHT_LABEL[light]} selected={light !== "off"} onPress={() => setLight(NEXT_LIGHT[light])} testID="toggle-light" />
          <RailButton onLight={ringLight} icon="⏱" label={tp.countdownSeconds ? `${tp.countdownSeconds}s` : "Timer"} selected={tp.countdownSeconds > 0} onPress={() => dispatch({ type: "setCountdown", seconds: nextCountdown })} testID="timer" />
          {content && !patrimonio ? (
            <RailButton onLight={ringLight} icon="✨" label={RETOUCH_SHORT[retouch]} selected={retouch !== "off"} onPress={cycleRetouch} testID="beauty" />
          ) : null}
          <RailButton onLight={ringLight} icon="Aa" label={prompterOn ? "Texto" : "Sem texto"} selected={prompterOn} onPress={() => setPrompterOn(!prompterOn)} testID="toggle-prompter" />
          <RailButton onLight={ringLight} icon="⚙" label="Ajustes" selected={settingsOpen} onPress={() => setSettingsOpen(!settingsOpen)} testID="open-settings" />
        </View>
      ) : null}
      {project ? (
        <View style={st.studio} pointerEvents="none" testID="studio-indicator">
          <Text style={st.meta}>{`🎥 ${project.skuNome ?? project.sku ?? "sem SKU"}${shot ? ` · ${SHOT_LIBRARY[shot].label}` : ""}`}</Text>
          {shot && !recording ? <Text style={st.meta}>{SHOT_LIBRARY[shot].hint}</Text> : null}
        </View>
      ) : null}

      <View style={[st.bottom, { bottom: 28 + insets.bottom }]}>
        {message ? <Text style={st.message} accessibilityRole="alert">{message}</Text> : null}
        {!recording && !settingsOpen && !patrimonio ? (
          <Pressable style={st.tip} testID="recording-tip" disabled={!scene.length} onPress={() => setShowScene(!showScene)}
            accessibilityRole={scene.length ? "button" : undefined} accessibilityHint={scene.length ? "Alterna entre como falar e como filmar" : undefined}>
            <Text style={st.tipText} numberOfLines={showScene ? 6 : 3}>{direction?.length ? tip : `💡 ${tip}`}</Text>
            {scene.length ? <Text style={st.tipSub}>{showScene ? "Toque para ver como falar" : "Toque para ver a cena (local, luz, enquadramento)"}</Text> : null}
            {content && retouch !== "off" && !direction?.length ? <Text style={st.tipSub}>{`✨ Embelezamento ${RETOUCH_SHORT[retouch].toLowerCase()} entra no vídeo final (a câmera mostra sem filtro)`}</Text> : null}
          </Pressable>
        ) : null}
        {settingsOpen && !recording ? (
          <View style={st.sheet} testID="settings-sheet">
            <Text style={st.sheetTitle}>Qualidade</Text>
            <View style={st.row}>
              {presets.map((p) => <Pill key={p} label={PRESET_LABEL[p]} selected={p === preset} onPress={() => { setPreset(p); savePrefs({ resolution: p }); }} testID={`res-${p}`} />)}
              {fpsOptions.map((f) => <Pill key={f} label={`${f}fps`} selected={f === effectiveFps} onPress={() => { setFps(f); savePrefs({ fps: f }); }} />)}
            </View>
            <Text style={st.sheetTitle}>Contagem antes de gravar</Text>
            <View style={st.row}>
              {[0, 3, 5].map((c) => <Pill key={c} label={c ? `${c}s` : "Sem contagem"} selected={tp.countdownSeconds === c} onPress={() => dispatch({ type: "setCountdown", seconds: c })} testID={`countdown-${c}`} />)}
            </View>
            {prompterOn ? (
              <>
                <Text style={st.sheetTitle}>{`Texto na tela · velocidade ${tp.speed}`}</Text>
                <View style={st.row}>
                  <Pill label="A−" onPress={() => dispatch({ type: "setFontSize", value: tp.fontSize - 4 })} hint="Letra menor" testID="font-minus" />
                  <Pill label="A+" onPress={() => dispatch({ type: "setFontSize", value: tp.fontSize + 4 })} hint="Letra maior" testID="font-plus" />
                  <Pill label="🐢 Devagar" onPress={() => dispatch({ type: "setSpeed", value: tp.speed - 1 })} hint="Mais devagar" testID="speed-minus" />
                  <Pill label="🐇 Rápido" onPress={() => dispatch({ type: "setSpeed", value: tp.speed + 1 })} hint="Mais rápido" testID="speed-plus" />
                  <Pill label="⇋ Espelhar" selected={tp.mirrored} onPress={() => dispatch({ type: "toggleMirror" })} hint="Espelhar" testID="mirror" />
                  <Pill label="↺ Do começo" onPress={() => dispatch({ type: "restart" })} hint="Reiniciar texto" testID="prompter-restart" />
                </View>
              </>
            ) : null}
            {project ? (
              <>
                <Text style={st.sheetTitle}>Tomada</Text>
                <View style={st.row}>
                  {PRODUCTION_MODES[project.mode].shots.map((k) => <Pill key={k} label={SHOT_LIBRARY[k].label} selected={k === shot} onPress={() => setShot(k)} testID={`shot-${k}`} />)}
                </View>
              </>
            ) : null}
          </View>
        ) : null}
        <View style={st.recRow}>
          <View style={st.side}>
            {prompterOn && (recording || tp.phase === "paused") ? (
              <Pill label={tp.phase === "paused" ? "▶ Texto" : "❚❚ Texto"} onPress={() => dispatch({ type: tp.phase === "paused" ? "resume" : "pause" })} hint="Pausar ou continuar texto" testID="prompter-pause" />
            ) : null}
          </View>
          <Pressable
            onPress={onRecordPress}
            disabled={busy || tp.phase === "countdown"}
            accessibilityRole="button"
            accessibilityLabel={recording ? "Parar gravação" : "Iniciar gravação"}
            style={[st.recBtn, recording && st.recBtnOn]}
            testID="record-button"
          >
            <View style={[st.recInner, recording && st.recInnerOn]} />
          </Pressable>
          <View style={st.side} />
        </View>
        {busy ? <Text style={st.meta}>Salvando no aparelho…</Text> : null}
      </View>
    </View>
  );
}

/** Plays the take right after recording, looping, with sound — to judge it on the spot. */
/** Medidas e observações anotadas na hora da filmagem (vão para o clipe, base da ficha técnica). */
function StudioNotes({ take }: { take: Take }) {
  const [text, setText] = useState(take.meta.medidas ?? "");
  const [ok, setOk] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <TextInput style={[s.input, { minHeight: 64, textAlignVertical: "top" }]} multiline value={text} onChangeText={(v) => { setText(v); setOk(false); }}
        placeholder="Medidas, temperatura, textura, observações desta tomada" accessibilityLabel="Medidas e observações" testID="studio-notes" />
      <Button compact variant="ghost" label={ok ? "✓ ANOTADO" : "SALVAR ANOTAÇÃO"} onPress={() => void updateTakeMeta(take.id, { meta: { medidas: text.trim() || null } }).then(() => setOk(true))} />
    </View>
  );
}

function ReviewPlayer({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.play();
  });
  return (
    <VideoView
      player={player}
      style={{ width: "72%", alignSelf: "center", aspectRatio: 9 / 16, borderRadius: 18, backgroundColor: "#000" }}
      nativeControls
      contentFit="cover"
      testID="review-player"
    />
  );
}

function Pill({ label, onPress, selected, hint, testID }: { label: string; onPress: () => void; selected?: boolean; hint?: string; testID?: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={hint ?? label} accessibilityState={{ selected: Boolean(selected) }} testID={testID}
      style={[st.pill, selected && { backgroundColor: "#FFFFFF" }]}>
      <Text style={[st.pillText, selected && { color: "#000000" }]}>{label}</Text>
    </Pressable>
  );
}

/** Botão do trilho lateral (estilo TikTok): ícone redondo com o nome embaixo. */
function RailButton({ icon, label, onPress, selected, testID, onLight }: { icon: string; label: string; onPress: () => void; selected?: boolean; testID?: string; onLight?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: Boolean(selected) }} testID={testID} style={st.railBtn} hitSlop={6}>
      <View style={[st.railIcon, selected && st.railIconOn]}>
        <Text style={[st.railIconText, selected && { color: "#000000" }]}>{icon}</Text>
      </View>
      <Text style={[st.railLabel, onLight && st.railLabelOnLight]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

const GLOW_LAYERS = 14;
/** Luz de tela suave: bordas claras que se desfazem para o centro (sem moldura dura). */
function SoftGlow({ color }: { color: string }) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID="ring-light">
      {Array.from({ length: GLOW_LAYERS }, (_, i) => (
        <View key={i} style={[StyleSheet.absoluteFill, { borderColor: color, borderWidth: 6 + i * 5, borderRadius: 40 + i * 4, opacity: 0.1 }]} />
      ))}
    </View>
  );
}

// branca primeiro: é a que mais ilumina (gravar na rua à noite); quente fica como opção para pele
type LightMode = "off" | "warm" | "neutral";
const NEXT_LIGHT: Record<LightMode, LightMode> = { off: "neutral", neutral: "warm", warm: "off" };
const LIGHT_LABEL: Record<LightMode, string> = { off: "Luz", neutral: "Luz máx.", warm: "Quente" };
/** instruções do diretor sobre a fala (o resto é a cena: local, luz, enquadramento…) */
const SPEECH_LABELS = ["Ritmo", "Emoção", "Olhar"];
/** teleprompter começa abaixo da etiqueta da parte (que fica a 18px da área segura) */
const PROMPTER_GAP_TOP = 76;

const RING_COLOR: Record<LightMode, string> = { off: "#000000", warm: "#FFE2BF", neutral: "#FFFFFF" };
/** largura da janela da câmera com a luz ligada (o resto da tela vira luz) */
const LIGHT_WINDOW = 0.66;
const RETOUCH_SHORT: Record<Retouch, string> = { forte: "Forte", leve: "Natural", off: "Embelezar" };

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000000", justifyContent: "center" },
  frame: { width: "100%", aspectRatio: 9 / 16, alignSelf: "center", overflow: "hidden" },
  top: { position: "absolute", top: 18, left: 12, right: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  close: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  closeText: { color: "#FFFFFF", fontSize: 26, fontWeight: "700", textShadowColor: "rgba(0,0,0,0.6)", textShadowRadius: 4 },
  topPill: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 24, backgroundColor: "rgba(0,0,0,0.45)" },
  topPillText: { color: "#FFFFFF", fontWeight: "800", fontSize: 15 },
  rail: { position: "absolute", top: 84, right: 8, alignItems: "center", gap: 14 },
  railBtn: { alignItems: "center", width: 62 },
  railIcon: { width: 46, height: 46, borderRadius: 23, backgroundColor: "rgba(0,0,0,0.35)", alignItems: "center", justifyContent: "center" },
  railIconOn: { backgroundColor: "#FFFFFF" },
  railIconText: { color: "#FFFFFF", fontSize: 20, fontWeight: "900" },
  railLabelOnLight: { color: "#111111", textShadowRadius: 0 },
  railLabel: { color: "#FFFFFF", fontSize: 11, fontWeight: "800", marginTop: 3, textShadowColor: "rgba(0,0,0,0.8)", textShadowRadius: 3 },
  studio: { position: "absolute", top: 64, left: 12, right: 80, alignItems: "center", gap: 2 },
  bottom: { position: "absolute", bottom: 28, left: 12, right: 12, alignItems: "center", gap: 10 },
  sheet: { alignSelf: "stretch", backgroundColor: "rgba(0,0,0,0.78)", borderRadius: 18, padding: 12, gap: 8 },
  sheetTitle: { color: "#FFFFFF", fontWeight: "900", fontSize: 13, opacity: 0.85 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center", alignItems: "center" },
  recRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", alignSelf: "stretch" },
  side: { flex: 1, alignItems: "center" },
  pill: { minHeight: 44, minWidth: 44, paddingHorizontal: 12, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.14)", alignItems: "center", justifyContent: "center" },
  pillText: { color: "#FFFFFF", fontWeight: "800", fontSize: 13 },
  meta: { color: "#FFFFFF", fontWeight: "700", fontSize: 13 },
  tip: { alignSelf: "stretch", backgroundColor: "rgba(0,0,0,0.5)", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, gap: 4 },
  tipText: { color: "#FFFFFF", fontWeight: "700", fontSize: 13, lineHeight: 18 },
  tipSub: { color: "#FFFFFF", fontWeight: "600", fontSize: 11, opacity: 0.8 },
  rec: { color: "#FF4D4D", fontWeight: "900", fontSize: 16, backgroundColor: "rgba(0,0,0,0.45)", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, overflow: "hidden" },
  message: { color: "#FFFFFF", backgroundColor: "rgba(180,35,24,0.85)", padding: 10, borderRadius: 10, fontWeight: "700" },
  recBtn: { width: 84, height: 84, borderRadius: 42, borderWidth: 5, borderColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  recBtnOn: { borderColor: "#FF4D4D" },
  recInner: { width: 66, height: 66, borderRadius: 33, backgroundColor: "#FE2C55" },
  recInnerOn: { width: 30, height: 30, borderRadius: 6 },
  countdown: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  countdownText: { color: "#FFFFFF", fontSize: 120, fontWeight: "900", textShadowColor: "#000", textShadowRadius: 12 },
});

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useKeepAwake } from "expo-keep-awake";
import { Camera, useCameraDevice, useCameraPermission, useMicrophonePermission, type VideoFile } from "react-native-vision-camera";
import {
  PRESET_LABEL, availablePresets, initialTeleprompter, pickFormat, supportedFps, teleprompterReducer, type ResolutionPreset,
} from "@postai/domain";
import { getContent, getTask, registerTake, runTaskAction, requireWorkspace, updateSettings, type Take } from "../src/db/repo";
import { freeDiskBytes, persistRecording } from "../src/media";
import { newId } from "../src/config";
import { syncNow } from "../src/sync/engine";
import { reportError } from "../src/telemetry";
import { Teleprompter } from "../src/components/Teleprompter";
import { Button, Loading, Screen, colors, s } from "../src/ui";

type Phase = "ready" | "recording" | "saving" | "saved" | "error";
const LOW_DISK = 500 * 1024 * 1024;

export default function RecordScreen() {
  useKeepAwake();
  const params = useLocalSearchParams<{ taskId?: string; contentId?: string; prompter?: string }>();
  const taskId = params.taskId || null;
  const contentId = params.contentId || null;
  const cam = useCameraPermission();
  const mic = useMicrophonePermission();
  const [position, setPosition] = useState<"front" | "back">("front");
  const device = useCameraDevice(position);
  const [preset, setPreset] = useState<ResolutionPreset>("1080p");
  const [fps, setFps] = useState(30);
  const [prompterOn, setPrompterOn] = useState(params.prompter === "1");
  const [script, setScript] = useState("");
  const [category, setCategory] = useState("livre");
  const [tp, dispatch] = useReducer(teleprompterReducer, initialTeleprompter);
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
      setCategory(task?.kind ?? content?.format ?? "livre");
      if (content?.draft) {
        const hook = content.draft.hook_options[content.selectedHook ?? 0];
        setScript(hook && !content.draft.script.startsWith(hook) ? `${hook}\n\n${content.draft.script}` : content.draft.script);
      } else if (task) {
        setScript(`${task.title}${task.hint ? `\n\n${task.hint}` : ""}`);
      }
    })().catch((e) => reportError(e, "record init"));
  }, [taskId, contentId]);

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
        durationMs: Math.round((video.duration ?? 0) * 1000), taskId, contentItemId: contentId, category, camera: position,
      });
      setSaved(take);
      setPhase("saved");
      void syncNow();
    } catch (e) {
      reportError(e, "persist recording");
      setMessage(`Não consegui salvar o vídeo: ${e instanceof Error ? e.message : String(e)}`);
      setPhase("error");
    }
  }, [taskId, contentId, category, position]);

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
      if (contentId) router.replace(`/content/${contentId}`);
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

  if (phase === "saved" && saved) {
    return (
      <Screen testID="saved-screen">
        <Text style={{ fontSize: 30, fontWeight: "900", color: colors.good }} testID="saved-local">Salvo no aparelho ✓</Text>
        <Text style={s.body}>
          {(saved.media.sizeBytes / 1_048_576).toFixed(1)} MB · {Math.round((saved.media.durationMs ?? 0) / 1000)}s · verificação {saved.media.checksum.slice(0, 8)}
        </Text>
        <Text style={s.muted}>O vídeo original está guardado no celular. Se estiver sem internet, ele vai para a nuvem sozinho quando a conexão voltar.</Text>
        {taskId ? <Button label="ANEXAR E MARCAR FEITO" onPress={attachAndDone} testID="attach-done" /> : <Button label="CONCLUIR" onPress={attachAndDone} testID="attach-done" />}
        <Button variant="secondary" label="GRAVAR OUTRO TAKE" onPress={() => { setSaved(null); setPhase("ready"); dispatch({ type: "restart" }); }} testID="record-again" />
        <Button variant="ghost" label="VER TAKE" onPress={() => router.push(`/take/${saved.id}`)} />
      </Screen>
    );
  }

  const busy = phase === "saving";
  return (
    <View style={st.root} testID="record-screen">
      <View style={st.frame}>
        <Camera
          ref={camera}
          style={StyleSheet.absoluteFill}
          device={device}
          format={format ?? undefined}
          fps={effectiveFps}
          isActive={phase !== "saving"}
          video
          audio={mic.hasPermission}
          resizeMode="cover"
        />
      </View>
      <Teleprompter text={script || "Sem roteiro — fale livremente."} state={tp} dispatch={dispatch} visible={prompterOn} />
      {tp.phase === "countdown" ? (
        <View style={st.countdown} pointerEvents="none" testID="countdown">
          <Text style={st.countdownText}>{Math.ceil(tp.countdownMs / 1000)}</Text>
        </View>
      ) : null}

      <View style={st.top}>
        <Pill label="✕" onPress={() => (phase === "recording" ? undefined : router.back())} hint="Fechar" />
        {phase === "recording" ? <Text style={st.rec} testID="rec-indicator">● REC {elapsed}s</Text> : <Text style={st.meta}>{PRESET_LABEL[format && presets.includes(preset) ? preset : "1080p"]} · {effectiveFps}fps · 9:16</Text>}
        <Pill label="⟲" onPress={() => phase !== "recording" && setPosition(position === "front" ? "back" : "front")} hint="Trocar câmera" testID="flip-camera" />
      </View>

      <View style={st.bottom}>
        {message ? <Text style={st.message} accessibilityRole="alert">{message}</Text> : null}
        {phase !== "recording" ? (
          <>
            <View style={st.row}>
              {presets.map((p) => <Pill key={p} label={PRESET_LABEL[p]} selected={p === preset} onPress={() => { setPreset(p); savePrefs({ resolution: p }); }} testID={`res-${p}`} />)}
              {fpsOptions.map((f) => <Pill key={f} label={`${f}fps`} selected={f === effectiveFps} onPress={() => { setFps(f); savePrefs({ fps: f }); }} />)}
            </View>
            <View style={st.row}>
              <Pill label={prompterOn ? "Prompter ON" : "Prompter OFF"} selected={prompterOn} onPress={() => setPrompterOn(!prompterOn)} testID="toggle-prompter" />
              {[0, 3, 5].map((c) => <Pill key={c} label={c ? `${c}s` : "sem contagem"} selected={tp.countdownSeconds === c} onPress={() => dispatch({ type: "setCountdown", seconds: c })} testID={`countdown-${c}`} />)}
            </View>
          </>
        ) : null}
        {prompterOn ? (
          <View style={st.row}>
            <Pill label="A−" onPress={() => dispatch({ type: "setFontSize", value: tp.fontSize - 4 })} testID="font-minus" />
            <Pill label="A+" onPress={() => dispatch({ type: "setFontSize", value: tp.fontSize + 4 })} testID="font-plus" />
            <Pill label="🐢" onPress={() => dispatch({ type: "setSpeed", value: tp.speed - 1 })} hint="Mais devagar" testID="speed-minus" />
            <Text style={st.meta}>vel {tp.speed}</Text>
            <Pill label="🐇" onPress={() => dispatch({ type: "setSpeed", value: tp.speed + 1 })} hint="Mais rápido" testID="speed-plus" />
            <Pill label="⇋" selected={tp.mirrored} onPress={() => dispatch({ type: "toggleMirror" })} hint="Espelhar" testID="mirror" />
            <Pill label={tp.phase === "paused" ? "▶" : "❚❚"} onPress={() => dispatch({ type: tp.phase === "paused" ? "resume" : "pause" })} hint="Pausar ou continuar texto" testID="prompter-pause" />
            <Pill label="↺" onPress={() => dispatch({ type: "restart" })} hint="Reiniciar texto" testID="prompter-restart" />
          </View>
        ) : null}
        <Pressable
          onPress={onRecordPress}
          disabled={busy || tp.phase === "countdown"}
          accessibilityRole="button"
          accessibilityLabel={phase === "recording" ? "Parar gravação" : "Iniciar gravação"}
          style={[st.recBtn, phase === "recording" && st.recBtnOn]}
          testID="record-button"
        >
          <View style={[st.recInner, phase === "recording" && st.recInnerOn]} />
        </Pressable>
        {busy ? <Text style={st.meta}>Salvando no aparelho…</Text> : null}
      </View>
    </View>
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

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000000", justifyContent: "center" },
  frame: { width: "100%", aspectRatio: 9 / 16, alignSelf: "center", overflow: "hidden" },
  top: { position: "absolute", top: 18, left: 12, right: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  bottom: { position: "absolute", bottom: 24, left: 12, right: 12, alignItems: "center", gap: 10 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center", alignItems: "center" },
  pill: { minHeight: 44, minWidth: 44, paddingHorizontal: 12, borderRadius: 22, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center" },
  pillText: { color: "#FFFFFF", fontWeight: "800", fontSize: 13 },
  meta: { color: "#FFFFFF", fontWeight: "700", fontSize: 13 },
  rec: { color: "#FF4D4D", fontWeight: "900", fontSize: 15 },
  message: { color: "#FFFFFF", backgroundColor: "rgba(180,35,24,0.85)", padding: 10, borderRadius: 10, fontWeight: "700" },
  recBtn: { width: 78, height: 78, borderRadius: 39, borderWidth: 5, borderColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  recBtnOn: { borderColor: "#FF4D4D" },
  recInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: "#FF3B30" },
  recInnerOn: { width: 30, height: 30, borderRadius: 6 },
  countdown: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  countdownText: { color: "#FFFFFF", fontSize: 120, fontWeight: "900", textShadowColor: "#000", textShadowRadius: 12 },
});

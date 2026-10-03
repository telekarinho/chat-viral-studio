import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { FORMAT_LABEL, computeProgress, nextTask, type RecordingTask, type TaskAction } from "@postai/domain";
import type { ContentItem } from "../db/repo";
import { Button, Card, Empty, Eyebrow, Section, colors, s } from "../ui";
import { TaskCard, hhmm } from "./TaskCard";

export interface TodayViewProps {
  now: Date;
  tasks: RecordingTask[];
  contents: ContentItem[];
  syncLabel: string | null;
  generatingId: string | null;
  onAction: (task: RecordingTask, action: TaskAction) => void;
  onRecord: (task: RecordingTask) => void;
  onOpenContent: (contentId: string) => void;
  onGenerate: (contentId: string) => void;
  onEvent: () => void;
  onFreeRecord: () => void;
  pillarNames?: Record<string, string>;
  /** menu "+ CRIAR": fica no fim, sem competir com a missão de agora */
  createSlot?: ReactNode;
  /** vídeos montados esperando aprovação (vêm antes de tudo) e os que estão montando agora */
  ready?: { id: string; title: string }[];
  rendering?: { id: string; title: string }[];
  onOpenReady?: (contentId: string) => void;
}

const CONTENT_STATUS: Record<ContentItem["status"], { label: string; color: string }> = {
  planned: { label: "SEM ROTEIRO", color: colors.warn },
  scripted: { label: "PRONTO PARA GRAVAR", color: colors.good },
  recorded: { label: "GRAVADO", color: colors.info },
  published: { label: "PUBLICADO", color: colors.good },
  done: { label: "CONCLUÍDO", color: colors.good },
};

/**
 * Hoje responde "o que eu gravo agora?": missão de agora em destaque, progresso, e o resto do dia numa lista só
 * (cada missão já mostra o roteiro dela — sem a mesma obrigação aparecer duas vezes).
 */
export function TodayView(p: TodayViewProps) {
  const progress = computeProgress(p.tasks);
  const next = nextTask(p.tasks, p.now);
  const byId = new Map(p.contents.map((c) => [c.id, c]));
  const nextContent = next?.contentItemId ? byId.get(next.contentItemId) : undefined;
  const dateLabel = p.now.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" }).toUpperCase();
  const rest = p.tasks.filter((t) => t.id !== next?.id);
  const linked = new Set(p.tasks.map((t) => t.contentItemId).filter(Boolean));
  const loose = p.contents.filter((c) => !linked.has(c.id));

  const scriptButton = (c: ContentItem, compact: boolean, variant: "primary" | "ghost" = "primary") => (
    c.format === "broll" || c.draft ? (
      <Button compact={compact} variant={variant} label={c.format === "broll" ? "VER CENAS" : "VER ROTEIRO"} onPress={() => p.onOpenContent(c.id)} testID={`open-${c.format}`} />
    ) : (
      <Button compact={compact} variant={variant} label="GERAR ROTEIRO" onPress={() => p.onGenerate(c.id)} loading={p.generatingId === c.id} testID={`generate-${c.format}`} />
    )
  );
  const contentLine = (c: ContentItem, indent = 60) => {
    const st = CONTENT_STATUS[c.status];
    return (
      <View style={[s.row, { alignItems: "center", gap: 8, paddingLeft: indent, marginTop: indent ? -6 : 4 }]} testID={`content-${c.format}`}>
        <Text style={[s.muted, { flex: 1 }]} numberOfLines={1}>
          <Text style={{ color: st.color, fontWeight: "900" }}>{st.label}</Text>
          {c.draft ? ` · ${c.draft.title}` : c.format === "broll" ? (c.cenas?.length ? ` · ${c.cenas.length} takes` : "") : ` · ${p.pillarNames?.[c.pillarSlug] ?? c.pillarSlug}`}
        </Text>
        {scriptButton(c, true, "ghost")}
      </View>
    );
  };

  return (
    <View style={{ gap: 14 }}>
      <View style={[s.row, { justifyContent: "space-between" }]}>
        <Eyebrow>{dateLabel}</Eyebrow>
        {p.syncLabel ? <Text style={{ fontSize: 12, color: colors.muted, fontWeight: "700" }} testID="sync-badge">{p.syncLabel}</Text> : null}
      </View>

      {p.ready?.length ? (
        <Pressable onPress={() => p.onOpenReady?.(p.ready![0]!.id)} accessibilityRole="button" testID="ready-video"
          style={{ backgroundColor: colors.good, borderRadius: 24, padding: 20, gap: 6 }}>
          <Text style={{ color: "#FFFFFF", fontSize: 12, fontWeight: "900", letterSpacing: 1.2 }}>{p.ready.length > 1 ? `${p.ready.length} VÍDEOS PRONTOS` : "SEU VÍDEO FICOU PRONTO"}</Text>
          <Text style={{ color: "#FFFFFF", fontSize: 20, fontWeight: "900" }} numberOfLines={2}>{p.ready[0]!.title}</Text>
          <Text style={{ color: "#FFFFFF", fontSize: 17, fontWeight: "900" }}>▶ VER E APROVAR</Text>
        </Pressable>
      ) : null}
      {p.rendering?.length ? (
        <Text style={{ color: colors.info, fontWeight: "800" }} testID="rendering-now">{`🎬 Montando: ${p.rendering.map((r) => r.title).join(", ")} — pode gravar o próximo.`}</Text>
      ) : null}

      {next ? (
        <View style={{ backgroundColor: colors.hero, borderRadius: 24, padding: 22, gap: 12 }} testID="hero-now">
          <Text style={{ color: colors.accent, fontSize: 12, fontWeight: "900", letterSpacing: 1.4 }}>AGORA · {hhmm(next.scheduledFor)}</Text>
          <Text style={{ color: "#FFFFFF", fontSize: 26, fontWeight: "900" }} accessibilityRole="header">{next.title}</Text>
          <Text style={{ color: "#C9CBD1", fontSize: 15 }}>{FORMAT_LABEL[next.kind]}{next.hint ? ` · ${next.hint}` : ""}</Text>
          {nextContent?.draft ? (
            <Text style={{ color: colors.heroText, fontSize: 17, lineHeight: 25 }} numberOfLines={4}>“{nextContent.draft.hook_options[nextContent.selectedHook ?? 0] ?? nextContent.draft.key_phrase}”</Text>
          ) : null}
          <Pressable onPress={() => p.onRecord(next)} accessibilityRole="button" accessibilityLabel="Gravar agora" testID="hero-record"
            style={{ backgroundColor: "#FE2C55", borderRadius: 40, minHeight: 72, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: "#FFFFFF", fontSize: 22, fontWeight: "900", letterSpacing: 1 }}>● GRAVAR</Text>
          </Pressable>
          {nextContent ? scriptButton(nextContent, false, "ghost") : null}
        </View>
      ) : p.tasks.length > 0 ? (
        <Empty title="Missões do dia resolvidas ✓" body="Se aconteceu algo que vale virar conteúdo, conta pra mim.">
          <Button compact label="ACONTECEU ALGO HOJE" onPress={p.onEvent} />
        </Empty>
      ) : (
        <Empty title="Sem rotina de gravação hoje" body="Dia livre. Se quiser, grave um take solto ou transforme algo do dia em conteúdo.">
          <View style={s.row}>
            <Button compact label="GRAVAR TAKE" onPress={p.onFreeRecord} />
            <Button compact variant="secondary" label="ACONTECEU ALGO" onPress={p.onEvent} />
          </View>
        </Empty>
      )}

      {p.tasks.length > 0 ? (
        <Card style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }} testID="progress-card">
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ fontSize: 17, fontWeight: "800", color: colors.ink }} testID="progress-label">{progress.label}</Text>
            <View style={{ height: 8, backgroundColor: colors.line, borderRadius: 4, marginTop: 4 }}>
              <View style={{ height: 8, width: `${progress.percent}%`, backgroundColor: colors.good, borderRadius: 4 }} />
            </View>
          </View>
          <Text style={{ fontSize: 22, fontWeight: "900", color: colors.ink, marginLeft: 16 }} accessibilityLabel={`${progress.percent} por cento`}>{progress.percent}%</Text>
        </Card>
      ) : null}

      {rest.length || loose.length ? <Section>Depois</Section> : null}
      {rest.map((t) => {
        const c = t.contentItemId ? byId.get(t.contentItemId) : undefined;
        return (
          <View key={t.id} style={{ gap: 0 }}>
            <TaskCard task={t} now={p.now} onAction={p.onAction} onRecord={p.onRecord} onOpenContent={(task) => task.contentItemId && p.onOpenContent(task.contentItemId)} />
            {c ? contentLine(c) : null}
          </View>
        );
      })}
      {loose.map((c) => (
        <Card key={c.id}>
          <Text style={{ fontSize: 16, fontWeight: "800", color: colors.ink }}>{FORMAT_LABEL[c.format]}</Text>
          {contentLine(c, 0)}
        </Card>
      ))}
      {p.createSlot}
      <Button variant="ghost" label="ACONTECEU ALGO HOJE? VIRA CONTEÚDO" onPress={p.onEvent} testID="event-button" />
    </View>
  );
}

import { Text, View } from "react-native";
import { FORMAT_LABEL, computeProgress, nextTask, type RecordingTask, type TaskAction } from "@postai/domain";
import type { ContentItem } from "../db/repo";
import { Button, Card, Empty, Eyebrow, H1, Section, colors, s } from "../ui";
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
}

const CONTENT_STATUS: Record<ContentItem["status"], { label: string; color: string }> = {
  planned: { label: "SEM ROTEIRO", color: colors.warn },
  scripted: { label: "PRONTO PARA GRAVAR", color: colors.good },
  recorded: { label: "GRAVADO", color: colors.info },
  published: { label: "PUBLICADO", color: colors.good },
  done: { label: "CONCLUÍDO", color: colors.good },
};

export function TodayView(p: TodayViewProps) {
  const progress = computeProgress(p.tasks);
  const next = nextTask(p.tasks, p.now);
  const nextContent = next?.contentItemId ? p.contents.find((c) => c.id === next.contentItemId) : undefined;
  const dateLabel = p.now.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" }).toUpperCase();

  return (
    <View style={{ gap: 14 }}>
      <View style={[s.row, { justifyContent: "space-between" }]}>
        <Eyebrow>Post.ai · {dateLabel}</Eyebrow>
        {p.syncLabel ? <Text style={{ fontSize: 12, color: colors.muted, fontWeight: "700" }} testID="sync-badge">{p.syncLabel}</Text> : null}
      </View>
      <H1>Hoje</H1>

      {next ? (
        <View style={{ backgroundColor: colors.hero, borderRadius: 24, padding: 22, gap: 12 }} testID="hero-now">
          <Text style={{ color: colors.accent, fontSize: 12, fontWeight: "900", letterSpacing: 1.4 }}>AGORA · {hhmm(next.scheduledFor)}</Text>
          <Text style={{ color: "#FFFFFF", fontSize: 26, fontWeight: "900" }} accessibilityRole="header">{next.title}</Text>
          <Text style={{ color: "#C9CBD1", fontSize: 15 }}>{FORMAT_LABEL[next.kind]}{next.hint ? ` · ${next.hint}` : ""}</Text>
          {nextContent?.draft ? (
            <Text style={{ color: colors.heroText, fontSize: 17, lineHeight: 25 }} numberOfLines={4}>“{nextContent.draft.hook_options[nextContent.selectedHook ?? 0] ?? nextContent.draft.key_phrase}”</Text>
          ) : null}
          <Button variant="light" label="GRAVAR AGORA" onPress={() => p.onRecord(next)} testID="hero-record" />
          {nextContent ? (
            <Button
              variant="ghost"
              label={nextContent.format === "broll" ? "VER CENAS" : nextContent.draft ? "VER ROTEIRO" : "GERAR ROTEIRO"}
              onPress={() => (nextContent.draft || nextContent.format === "broll" ? p.onOpenContent(nextContent.id) : p.onGenerate(nextContent.id))}
              loading={p.generatingId === nextContent.id}
              testID="hero-script"
            />
          ) : null}
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
            <Text style={{ fontSize: 11, fontWeight: "900", color: colors.muted, letterSpacing: 1 }}>PROGRESSO DO DIA</Text>
            <Text style={{ fontSize: 17, fontWeight: "800", color: colors.ink }} testID="progress-label">{progress.label}</Text>
            <View style={{ height: 8, backgroundColor: colors.line, borderRadius: 4, marginTop: 4 }}>
              <View style={{ height: 8, width: `${progress.percent}%`, backgroundColor: colors.good, borderRadius: 4 }} />
            </View>
          </View>
          <Text style={{ fontSize: 26, fontWeight: "900", color: colors.ink, marginLeft: 16 }} accessibilityLabel={`${progress.percent} por cento`}>{progress.percent}%</Text>
        </Card>
      ) : null}

      {p.contents.length > 0 ? <Section>Conteúdos do dia</Section> : null}
      {p.contents.map((c) => {
        const st = CONTENT_STATUS[c.status];
        return (
          <Card key={c.id} testID={`content-${c.format}`}>
            <View style={[s.row, { justifyContent: "space-between" }]}>
              <Text style={{ fontSize: 16, fontWeight: "800", color: colors.ink }}>{FORMAT_LABEL[c.format]}</Text>
              <Text style={{ fontSize: 11, fontWeight: "900", color: st.color }}>{st.label}</Text>
            </View>
            <Text style={s.muted} numberOfLines={2}>{c.format === "broll" ? `${c.title}${c.cenas?.length ? ` · ${c.cenas.length} takes` : ""}` : c.draft ? c.draft.title : `Pilar: ${p.pillarNames?.[c.pillarSlug] ?? c.pillarSlug}`}</Text>
            <View style={[s.row, { marginTop: 6 }]}>
              {c.format === "broll" ? (
                <Button compact label="VER CENAS" onPress={() => p.onOpenContent(c.id)} testID={`open-${c.format}`} />
              ) : c.draft ? (
                <Button compact label="VER ROTEIRO" onPress={() => p.onOpenContent(c.id)} testID={`open-${c.format}`} />
              ) : (
                <Button compact label="GERAR ROTEIRO" onPress={() => p.onGenerate(c.id)} loading={p.generatingId === c.id} testID={`generate-${c.format}`} />
              )}
            </View>
          </Card>
        );
      })}
      <Button variant="secondary" label="ACONTECEU ALGO HOJE? VIRA CONTEÚDO" onPress={p.onEvent} testID="event-button" />

      {p.tasks.length > 0 ? <Section>Missões de captação</Section> : null}
      {p.tasks.map((t) => (
        <TaskCard key={t.id} task={t} now={p.now} onAction={p.onAction} onRecord={p.onRecord} onOpenContent={(task) => task.contentItemId && p.onOpenContent(task.contentItemId)} />
      ))}
    </View>
  );
}

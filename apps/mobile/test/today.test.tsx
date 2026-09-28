import { fireEvent, render, screen } from "@testing-library/react-native";
import { RODRIGO_PILLARS, buildDayPlan, rodrigoRoutine, type RecordingTask } from "@postai/domain";
import { TodayView, type TodayViewProps } from "../src/components/TodayView";
import type { ContentItem } from "../src/db/repo";
import { syncLabel } from "../src/sync/label";

let n = 0;
const newId = () => `id-${++n}`;
const monday = new Date(2026, 8, 28, 10, 20);
const plan = buildDayPlan({ date: monday, workspaceId: "ws", routine: rodrigoRoutine(newId), pillars: RODRIGO_PILLARS, recentPillarSlugs: [], newId, now: monday.toISOString() });
const contents: ContentItem[] = plan.contentItems.map((c) => ({ ...c, draft: null, meta: null, selectedHook: null }));

function setup(over: Partial<TodayViewProps> = {}) {
  const props: TodayViewProps = {
    now: monday, tasks: plan.tasks, contents, syncLabel: "Offline · tudo salvo no aparelho", generatingId: null,
    onAction: jest.fn(), onRecord: jest.fn(), onOpenContent: jest.fn(), onGenerate: jest.fn(), onEvent: jest.fn(), onFreeRecord: jest.fn(), ...over,
  };
  render(<TodayView {...props} />);
  return props;
}

describe("Tela Hoje", () => {
  it("responde 'o que gravar agora' com a próxima missão (10:30 Pensamento do Dia)", () => {
    const p = setup();
    expect(screen.getByTestId("hero-now")).toHaveTextContent(/Pensamento do Dia/);
    fireEvent.press(screen.getByTestId("hero-record"));
    expect(p.onRecord).toHaveBeenCalledWith(expect.objectContaining({ title: "Pensamento do Dia" }));
  });

  it("mostra progresso do dia e status offline", () => {
    const tasks = plan.tasks.map((t, i): RecordingTask => (i < 2 ? { ...t, status: "done" } : t));
    setup({ tasks });
    expect(screen.getByTestId("progress-label")).toHaveTextContent("2 de 10 missões feitas");
    expect(screen.getByTestId("sync-badge")).toHaveTextContent(/Offline/);
  });

  it("gera roteiro do Pensamento e do Vídeo principal", () => {
    const p = setup();
    fireEvent.press(screen.getByTestId("generate-main_video"));
    expect(p.onGenerate).toHaveBeenCalledWith(contents[1]!.id);
  });

  it("ações FEITO / PULAR / NÃO ACONTECEU / REMARCAR / USAR OUTRA CENA", () => {
    const p = setup();
    const title = "Café / B-roll";
    fireEvent.press(screen.getByLabelText(new RegExp(`${title}`)));
    fireEvent.press(screen.getByTestId(`task-done-${title}`));
    expect(p.onAction).toHaveBeenLastCalledWith(expect.objectContaining({ title }), { type: "done" });

    fireEvent.press(screen.getByLabelText(new RegExp(title)));
    fireEvent.press(screen.getByTestId(`task-skip-${title}`));
    expect(p.onAction).toHaveBeenLastCalledWith(expect.anything(), { type: "skip" });

    fireEvent.press(screen.getByLabelText(new RegExp(title)));
    fireEvent.press(screen.getByTestId(`task-dnh-${title}`));
    expect(p.onAction).toHaveBeenLastCalledWith(expect.anything(), { type: "did_not_happen" });

    fireEvent.press(screen.getByLabelText(new RegExp(title)));
    fireEvent.press(screen.getByTestId(`task-resched-${title}`));
    fireEvent.press(screen.getByTestId("resched-+1 hora"));
    expect(p.onAction).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ type: "reschedule" }));

    fireEvent.press(screen.getByLabelText(new RegExp(title)));
    fireEvent.press(screen.getByTestId(`task-alt-${title}`));
    fireEvent.changeText(screen.getByTestId("alt-scene-input"), "Café na padaria");
    fireEvent.press(screen.getByTestId("alt-scene-confirm"));
    expect(p.onAction).toHaveBeenLastCalledWith(expect.anything(), { type: "alternate_scene", scene: "Café na padaria" });
  });

  it("fim de semana mostra estado vazio sem culpa", () => {
    setup({ tasks: [], contents: [] });
    expect(screen.getByText("Sem rotina de gravação hoje")).toBeTruthy();
  });

  it("rótulo de sincronização", () => {
    const base = { running: false, online: true, pendingRows: 0, pendingMedia: 0, failedMedia: 0, lastRunAt: null, lastError: null };
    expect(syncLabel(base, false)).toBe("Modo local");
    expect(syncLabel({ ...base, online: false, pendingMedia: 2 }, true)).toMatch(/2 vídeo/);
    expect(syncLabel(base, true)).toBe("Sincronizado ✓");
  });
});

import { fireEvent, render, screen } from "@testing-library/react-native";
import type { Take } from "../src/db/repo";

jest.mock("expo-video", () => ({ useVideoPlayer: () => ({}), VideoView: () => null }));
jest.mock("../src/db/repo", () => ({ updateTakeMeta: jest.fn(async () => undefined) }));
jest.mock("../src/telemetry", () => ({ reportError: jest.fn() }));

import { TakeReview } from "../src/components/TakeReview";
import { updateTakeMeta } from "../src/db/repo";

const TEXT = "uma duas três quatro cinco seis sete oito nove dez";
const take = (id: string, durationMs: number): Take => ({
  id, workspaceId: "ws", taskId: null, contentItemId: "c", mediaId: `m-${id}`, category: "thought", tags: [], camera: "front", favorite: false, segmentIndex: 0,
  createdAt: id, meta: {} as Take["meta"], media: { localUri: `file://${id}.mp4`, durationMs, width: 1080, height: 1920, sizeBytes: 1, storageKey: null, workspaceId: "ws" } as Take["media"],
});

describe("revisão do take", () => {
  it("diagnóstico objetivo, Take 1/2 com recomendação técnica, usar o escolhido e favoritar", () => {
    const onUse = jest.fn();
    // mais novos primeiro: o novo falou rápido, o antigo ficou bom
    render(<TakeReview takes={[take("novo", 2600), take("velho", 4500)]} text={TEXT} title="Parte 1 salva ✓" useLabel="✓ USAR ESTE" useTestID="next-part"
      retakeLabel="↺ GRAVAR NOVAMENTE" retakeTestID="retake-part" onUse={onUse} onRetake={jest.fn()} />);
    expect(screen.getByTestId("check-ritmo")).toHaveTextContent("🟡 Falou um pouco rápido");
    expect(screen.getByTestId("take-option-1")).toHaveTextContent("Take 1 ★");
    expect(screen.queryByText(/viralizar/i)).toBeNull();
    fireEvent.press(screen.getByTestId("take-option-1"));
    expect(screen.getByTestId("check-ritmo")).toHaveTextContent("🟢 Ritmo bom");
    fireEvent.press(screen.getByTestId("next-part"));
    expect(onUse).toHaveBeenCalledWith(expect.objectContaining({ id: "velho" }));
    fireEvent.press(screen.getByTestId("favorite-take"));
    expect(updateTakeMeta).toHaveBeenCalledWith("velho", { favorite: true });
    expect(screen.getByTestId("favorite-take")).toHaveTextContent("★ FAVORITO");
  });
});

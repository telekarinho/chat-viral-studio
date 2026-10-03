import { Linking } from "react-native";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { ScriptSegment } from "@postai/domain";

const mockRequests = [{ id: "r1", texto: "quero mais rápido", resposta: "Propus cortes mais curtos (AutoCut TikTok).", createdAt: "x" }];
jest.mock("../src/directorChat", () => ({
  listDirectorRequests: jest.fn(async () => mockRequests),
  sendDirectorRequest: jest.fn(async () => true),
  claudeAskUrl: jest.fn(() => "https://claude.ai/new?q=x"),
}));
jest.mock("../src/editProposals", () => ({ pullEditProposal: jest.fn(async () => ({ id: "p1", edit: { autocut: "tiktok" }, motivo: "Fala animada." })) }));
jest.mock("../src/telemetry", () => ({ reportError: jest.fn() }));

import { DirectorSheet } from "../src/components/DirectorSheet";
import { sendDirectorRequest } from "../src/directorChat";

const seg = (index: number, label: string): ScriptSegment => ({ index, role: "free", label, text: "x" });

describe("painel do Diretor", () => {
  it("mostra o que existe, o que falta, a proposta e a conversa; envia o pedido ao Claude", async () => {
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    render(<DirectorSheet visible onClose={jest.fn()} workspaceId="ws" contentId="c1" segments={[seg(0, "Gancho"), seg(1, "Explicação"), seg(2, "CTA")]} recorded={[0]} business={false} cloud />);
    expect(screen.getByTestId("director-material")).toHaveTextContent(/✅ Gancho.*○ Explicação.*○ CTA/);
    expect(screen.getByTestId("director-recommendation")).toHaveTextContent("Grave as partes 2, 3 para completar o material.");
    await waitFor(() => expect(screen.getByTestId("director-sheet-proposal")).toHaveTextContent(/AutoCut Acelerada TikTok/));
    expect(screen.getByTestId("director-answer")).toHaveTextContent(/^🎬 Propus cortes mais curtos/);
    fireEvent.press(screen.getByText("troca o começo"));
    await act(async () => { fireEvent.press(screen.getByTestId("director-send")); });
    expect(sendDirectorRequest).toHaveBeenCalledWith("ws", "c1", "troca o começo");
    expect(open).toHaveBeenCalledWith("https://claude.ai/new?q=x");
  });
});

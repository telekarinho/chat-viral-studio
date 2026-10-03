import { fireEvent, render, screen } from "@testing-library/react-native";

let mockRow: { id: string; edit: unknown; motivo: string } | null = null;
const mockUpdates: unknown[] = [];
jest.mock("../src/supabase", () => {
  const query = {
    select: () => query, eq: () => query, is: () => query, order: () => query, limit: () => query,
    maybeSingle: async () => ({ data: mockRow, error: null }),
    update: (v: unknown) => { mockUpdates.push(v); return query; },
  };
  return { supabase: { from: () => query } };
});
jest.mock("../src/ownMusic", () => ({ listOwnMusic: jest.fn(async () => []) }));

import { pullEditProposal } from "../src/editProposals";
import { DirectorProposal } from "../src/components/DirectorProposal";

describe("proposta do diretor", () => {
  beforeEach(() => { mockUpdates.length = 0; });

  it("mostra a proposta válida", async () => {
    mockRow = { id: "p1", edit: { autocut: "tiktok", music: "mixkit-22", musicVolume: 0.3 }, motivo: "Fala animada." };
    const p = await pullEditProposal("ws", "c1", false);
    expect(p).toEqual({ id: "p1", edit: { autocut: "tiktok", music: "mixkit-22", musicVolume: 0.3 }, motivo: "Fala animada." });
    expect(mockUpdates).toHaveLength(0);
  });

  it("proposta inválida (volume alto demais) é dispensada e não aparece", async () => {
    mockRow = { id: "p2", edit: { music: "mixkit-22", musicVolume: 0.9 }, motivo: "x" };
    expect(await pullEditProposal("ws", "c1", false)).toBeNull();
    expect(mockUpdates[0]).toMatchObject({ decisao: "dispensar" });
  });

  it("botões decidem MONTAR ASSIM / AJUSTAR / dispensar", () => {
    const onDecide = jest.fn();
    render(<DirectorProposal proposal={{ id: "p1", edit: { autocut: "tiktok", music: "mixkit-22" }, motivo: "Fala animada." }} onDecide={onDecide} />);
    expect(String(screen.getByTestId("director-proposal-text").props.children)).toBe("AutoCut Acelerada TikTok · música Piano Reflections");
    fireEvent.press(screen.getByTestId("proposal-montar"));
    fireEvent.press(screen.getByTestId("proposal-ajustar"));
    fireEvent.press(screen.getByTestId("proposal-dispensar"));
    expect(onDecide.mock.calls.map((c) => c[0])).toEqual(["montar", "ajustar", "dispensar"]);
  });
});

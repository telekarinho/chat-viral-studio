import { useState } from "react";
import { Text } from "react-native";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { DEFAULT_EDIT_CHOICES, type EditChoices } from "@postai/domain";

const mockPlayers: { src: string; play: jest.Mock; pause: jest.Mock; release: jest.Mock; volume: number; currentTime: number }[] = [];
jest.mock("expo-video", () => ({
  createVideoPlayer: (src: string) => {
    const p = { src, play: jest.fn(), pause: jest.fn(), release: jest.fn(), volume: 1, currentTime: 0 };
    mockPlayers.push(p);
    return p;
  },
}));
const MOCK_OWN = { id: "11111111-1111-4111-8111-111111111111", titulo: "Trilha do Loucura de Amor", comercial: true, storageKey: "w/music/a.mp3" };
jest.mock("../src/ownMusic", () => ({
  listOwnMusic: jest.fn(async () => [MOCK_OWN]),
  ownMusicUrl: jest.fn(async () => "https://storage/own.mp3"),
  uploadOwnMusic: jest.fn(), renameOwnMusic: jest.fn(async () => undefined), deleteOwnMusic: jest.fn(async () => undefined),
}));
let mockFavs: string[] = [];
jest.mock("../src/musicFavorites", () => ({
  loadMusicFavorites: jest.fn(async () => mockFavs),
  syncMusicFavorites: jest.fn(async () => mockFavs),
  toggleMusicFavorite: jest.fn(async (id: string) => { mockFavs = mockFavs.includes(id) ? mockFavs.filter((x) => x !== id) : [id, ...mockFavs]; return mockFavs; }),
}));
jest.mock("../src/db/repo", () => ({ musicUsage: jest.fn(async () => ({ recents: ["mixkit-963"], count: { "mixkit-963": 2 } })) }));
jest.mock("../src/telemetry", () => ({ reportError: jest.fn() }));

import { MusicDrawer } from "../src/components/MusicDrawer";
import { AutoCutThemes } from "../src/components/AutoCutThemes";
import { toggleMusicFavorite } from "../src/musicFavorites";

function Harness({ business = false }: { business?: boolean }) {
  const [v, setV] = useState<EditChoices>({ ...DEFAULT_EDIT_CHOICES });
  return (
    <>
      <MusicDrawer value={v} onChange={setV} workspaceId="ws" business={business} pillarSlug="familia" />
      <Text testID="state">{JSON.stringify({ music: v.music, vol: v.musicVolume, start: v.musicStartS ?? null })}</Text>
    </>
  );
}
const state = () => JSON.parse(String(screen.getByTestId("state").props.children)) as { music: string; vol: number; start: number | null };

describe("biblioteca de música", () => {
  beforeEach(() => { mockPlayers.length = 0; mockFavs = []; jest.clearAllMocks(); });

  it("abre, toca uma faixa por vez (a anterior para e é liberada), favorita e usa", async () => {
    render(<Harness />);
    fireEvent.press(screen.getByTestId("open-music-drawer"));
    await waitFor(() => expect(screen.getByTestId("music-row-mixkit-839")).toBeTruthy());
    // Para você do clima Família: tocar
    await act(async () => { fireEvent.press(screen.getByTestId("music-play-mixkit-839")); });
    expect(mockPlayers).toHaveLength(1);
    expect(mockPlayers[0]!.play).toHaveBeenCalled();
    // tocar outra: a primeira para e é liberada
    await act(async () => { fireEvent.press(screen.getByTestId("music-play-mixkit-801")); });
    expect(mockPlayers[0]!.pause).toHaveBeenCalled();
    expect(mockPlayers[0]!.release).toHaveBeenCalled();
    expect(mockPlayers).toHaveLength(2);
    // tocar a mesma de novo: para
    await act(async () => { fireEvent.press(screen.getByTestId("music-play-mixkit-801")); });
    expect(mockPlayers[1]!.release).toHaveBeenCalled();
    // favoritar e desfavoritar
    await act(async () => { fireEvent.press(screen.getByTestId("music-fav-mixkit-839")); });
    expect(toggleMusicFavorite).toHaveBeenCalledWith("mixkit-839", "ws");
    expect(mockFavs).toEqual(["mixkit-839"]);
    // usar
    fireEvent.press(screen.getByTestId("music-use-mixkit-839"));
    expect(state().music).toBe("mixkit-839");
    expect(screen.getByTestId("music-use-mixkit-839")).toBeTruthy();
  });

  it("abas: favoritas, recentes, minhas; busca instantânea", async () => {
    mockFavs = ["mixkit-22"];
    render(<Harness />);
    fireEvent.press(screen.getByTestId("open-music-drawer"));
    await waitFor(() => expect(screen.getByTestId("music-tab-favoritas")).toBeTruthy());
    fireEvent.press(screen.getByTestId("music-tab-favoritas"));
    await waitFor(() => expect(screen.getByTestId("music-row-mixkit-22")).toBeTruthy());
    expect(screen.queryByTestId("music-row-mixkit-839")).toBeNull();
    fireEvent.press(screen.getByTestId("music-tab-recentes"));
    expect(screen.getByTestId("music-row-mixkit-963")).toBeTruthy();
    fireEvent.press(screen.getByTestId("music-tab-minhas"));
    await waitFor(() => expect(screen.getByTestId(`music-row-own:${MOCK_OWN.id}`)).toBeTruthy());
    fireEvent.changeText(screen.getByTestId("music-search"), "tears");
    expect(screen.getByTestId("music-row-mixkit-839")).toBeTruthy();
    expect(screen.queryByTestId("music-row-mixkit-22")).toBeNull();
  });

  it("volume com limite que protege a fala; trecho; automática e sem música", async () => {
    render(<Harness />);
    fireEvent.press(screen.getByTestId("open-music-drawer"));
    await waitFor(() => expect(screen.getByTestId("music-volume-up")).toBeTruthy());
    for (let i = 0; i < 10; i++) fireEvent.press(screen.getByTestId("music-volume-up"));
    expect(state().vol).toBe(0.45);
    fireEvent.press(screen.getByTestId("music-volume-Baixinha"));
    expect(state().vol).toBe(0.12);
    fireEvent.press(screen.getByTestId("music-use-mixkit-839"));
    fireEvent.press(screen.getByTestId("music-start-10"));
    expect(state().start).toBe(10);
    // trocar a faixa zera o trecho (era da outra música)
    fireEvent.press(screen.getByTestId("music-use-mixkit-801"));
    expect(state().start).toBeNull();
    fireEvent.press(screen.getByTestId("music-none"));
    expect(state().music).toBe("none");
    expect(screen.queryByTestId("music-volume")).toBeNull();
    fireEvent.press(screen.getByTestId("music-auto"));
    expect(state().music).toBe("auto");
  });

  it("empresa não vê música própria sem licença comercial", async () => {
    const own = jest.requireMock("../src/ownMusic") as { listOwnMusic: jest.Mock };
    own.listOwnMusic.mockResolvedValueOnce([{ ...MOCK_OWN, comercial: false }]);
    render(<Harness business />);
    fireEvent.press(screen.getByTestId("open-music-drawer"));
    await waitFor(() => expect(screen.getByTestId("music-tab-minhas")).toBeTruthy());
    fireEvent.press(screen.getByTestId("music-tab-minhas"));
    await waitFor(() => expect(screen.getByTestId("music-empty")).toBeTruthy());
  });
});

describe("AutoCut", () => {
  function ThemeHarness() {
    const [v, setV] = useState<EditChoices>({ ...DEFAULT_EDIT_CHOICES });
    return (
      <>
        <AutoCutThemes value={v} onChange={setV} />
        <Text testID="state">{JSON.stringify({ autocut: v.autocut ?? null, caption: v.captionStyle, vol: v.musicVolume })}</Text>
        <Text testID="tweak" onPress={() => setV({ ...v, captionStyle: "limpo" })}>tweak</Text>
      </>
    );
  }
  it("aplica o tema (guarda para o servidor) e vira Personalizado quando o criador muda algo", () => {
    render(<ThemeHarness />);
    fireEvent.press(screen.getByTestId("autocut-theme-tiktok"));
    const st = JSON.parse(String(screen.getByTestId("state").props.children));
    expect(st).toEqual({ autocut: "tiktok", caption: "destaque", vol: 0.3 });
    expect(String(screen.getByTestId("autocut-status").props.children)).toContain("zero silêncio");
    fireEvent.press(screen.getByTestId("tweak"));
    expect(String(screen.getByTestId("autocut-status").props.children)).toContain("Personalizado (base: Acelerada TikTok)");
  });
});

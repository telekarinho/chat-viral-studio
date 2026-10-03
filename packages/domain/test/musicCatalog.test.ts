import { describe, expect, it } from "vitest";
import { MUSIC_LIBRARY, forYou, musicCatalog, musicTab, pickAutoTrack, searchMusic } from "../src";

const own = [{ id: "11111111-1111-4111-8111-111111111111", titulo: "Trilha do Loucura de Amor", comercial: false, storageKey: "w/music/a.mp3" }];
const ctx = { favorites: ["mixkit-22"], recents: ["mixkit-839", "mixkit-963"], mood: "familia" as const };

describe("biblioteca de música", () => {
  it("catálogo: minhas + licenciadas; empresa só com licença comercial", () => {
    expect(musicCatalog(own, false)).toHaveLength(MUSIC_LIBRARY.length + 1);
    expect(musicCatalog(own, true).some((r) => r.own)).toBe(false);
    expect(musicCatalog(own, false)[0]).toMatchObject({ id: `own:${own[0]!.id}`, artist: "Minha música", license: "pessoal" });
  });
  it("busca por título, artista, clima, minhas e BPM aproximado", () => {
    const rows = musicCatalog(own, false);
    expect(searchMusic(rows, "tears").map((r) => r.id)).toEqual(["mixkit-839"]);
    expect(searchMusic(rows, "ramir").length).toBeGreaterThan(2);
    expect(searchMusic(rows, "familia").every((r) => r.mood === "familia")).toBe(true);
    expect(searchMusic(rows, "minha").map((r) => r.id)).toEqual([`own:${own[0]!.id}`]);
    expect(searchMusic(rows, "124").every((r) => r.bpm !== null && Math.abs(r.bpm - 124) <= 10)).toBe(true);
    expect(searchMusic(rows, "")).toHaveLength(rows.length);
  });
  it("abas: favoritas, recentes na ordem, minhas, clima", () => {
    const rows = musicCatalog(own, false);
    expect(musicTab(rows, "favoritas", ctx).map((r) => r.id)).toEqual(["mixkit-22"]);
    expect(musicTab(rows, "recentes", ctx).map((r) => r.id)).toEqual(["mixkit-839", "mixkit-963"]);
    expect(musicTab(rows, "minhas", ctx)).toHaveLength(1);
    expect(musicTab(rows, "treino", ctx).every((r) => r.mood === "treino")).toBe(true);
  });
  it("Para você: clima do vídeo primeiro, sem a última usada no topo", () => {
    const top = forYou(musicCatalog([], false), ctx, 3);
    expect(top[0]!.mood).toBe("familia");
    expect(top[0]!.id).not.toBe("mixkit-839"); // acabou de ser usada
  });
  it("música automática não repete as últimas do perfil e é estável", () => {
    const a = pickAutoTrack("familia", "c1", ["mixkit-839", "mixkit-963"]);
    expect(a.id).toBe("mixkit-801");
    expect(pickAutoTrack("familia", "c1", ["mixkit-839", "mixkit-963"]).id).toBe(a.id);
    // todas usadas: ainda escolhe uma do clima
    expect(pickAutoTrack("familia", "c1", ["mixkit-839", "mixkit-963", "mixkit-801"]).mood).toBe("familia");
  });
});

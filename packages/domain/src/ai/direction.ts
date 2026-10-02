import { z } from "zod";
import { MOOD_LABEL, ownMusicId, trackById, type MusicMood, type MusicTrack, type OwnMusic } from "../music";

const MOODS = Object.keys(MOOD_LABEL) as MusicMood[];
const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
/** Clima aceito: o valor de listar_musicas (ex.: "reflexao"); nome ("Reflexão (piano)") também vale; outro texto vira "". */
export function normalizeMood(s: string): MusicMood | "" {
  const p = plain(s);
  if (!p) return "";
  return MOODS.find((m) => m === p || plain(MOOD_LABEL[m]) === p || plain(MOOD_LABEL[m]).startsWith(p)) ?? "";
}

/**
 * Direção completa do vídeo (o “diretor de gravações”): tomada por tomada, texto na tela, música, edição, capa,
 * publicação por rede e teste de gancho. Opcional no roteiro; quando vem, o app grava, legenda e monta por ela.
 */
const s = (max: number) => z.string().trim().max(max);
const req = (max: number) => z.string().trim().min(1).max(max);
const sec = z.number().min(0).max(600);

export const TakeSchema = z.object({
  ordem: z.number().int().min(1).max(30),
  nome: req(80),
  /** o que falar, palavra por palavra (vazio = cena sem fala / B-roll) */
  fala_exata: s(1500).default(""),
  ritmo: s(200).default(""),
  duracao_segundos: z.number().min(1).max(180),
  enquadramento: s(160).default(""),
  movimento_camera: s(160).default(""),
  local: s(160).default(""),
  luz: s(160).default(""),
  olhar: s(160).default(""),
  emocao: s(120).default(""),
  broll: s(300).default(""),
  erro_comum: s(240).default(""),
});

export const ON_SCREEN_POSITIONS = ["topo", "centro", "base"] as const;
export const OnScreenTextSchema = z.object({
  texto: req(80),
  inicio: sec,
  fim: sec,
  posicao: z.enum(ON_SCREEN_POSITIONS).default("topo"),
  estilo: s(60).default(""),
});

export const DirectionSchema = z.object({
  takes: z.array(TakeSchema).min(1).max(20),
  legendas_na_tela: z.array(OnScreenTextSchema).max(12).default([]),
  musica: z.object({
    id: req(40),
    /** um de listar_musicas: reflexao | motivacional | treino | familia | humor | empresa | calmo */
    clima: s(40).default("").transform(normalizeMood),
    bpm: z.number().int().min(40).max(220).nullable().default(null),
    /** volume da música em relação à voz, 0.05–0.6 (0.22 = padrão) */
    volume: z.number().min(0.05).max(0.6).default(0.22),
    entrada: sec.default(0),
    /** segundo em que a música sai (null = até o fim) */
    saida: sec.nullable().default(null),
  }).nullable().default(null),
  edicao: z.object({ cortes: s(300).default(""), transicao: s(200).default(""), zoom: s(200).default("") }).default({ cortes: "", transicao: "", zoom: "" }),
  capa: z.object({ frame: sec, texto: s(60).default("") }).nullable().default(null),
  publicacao_por_rede: z.array(z.object({
    rede: z.enum(["instagram", "tiktok", "facebook", "youtube_shorts"]),
    horario: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    hashtags: z.array(z.string().trim().regex(/^#[\p{L}\p{N}_]+$/u)).max(15).default([]),
    primeiro_comentario: s(500).default(""),
  })).max(4).default([]),
  teste_ab: z.object({ ganchos: z.array(req(200)).min(2).max(3), metrica: s(120).default("") }).nullable().default(null),
});

export type Direction = z.infer<typeof DirectionSchema>;

/** Cena de apoio dirigida (B-roll da empresa): só takes, sem fala obrigatória. */
export const ScenesSchema = z.array(TakeSchema).min(1).max(12);
export type Scenes = z.infer<typeof ScenesSchema>;
export type DirectionTake = z.infer<typeof TakeSchema>;

/** Problemas da direção que impedem gravar/montar só com o que o app mostra. */
export function directionIssues(d: Direction, opts: { durationSeconds: number; spoken: boolean; business: boolean; ownMusic?: readonly OwnMusic[] }): string[] {
  const out: string[] = [];
  const orders = d.takes.map((t) => t.ordem);
  if (new Set(orders).size !== orders.length) out.push("direcao.takes: cada take precisa de uma ordem diferente.");
  if (opts.spoken && !d.takes.some((t) => t.fala_exata.trim())) out.push("direcao.takes: nenhum take tem fala_exata — o app grava a fala por take.");
  const total = d.takes.reduce((a, t) => a + t.duracao_segundos, 0);
  if (total > opts.durationSeconds * 1.6 + 5) out.push(`direcao.takes: somam ${Math.round(total)}s, bem mais que os ${opts.durationSeconds}s do vídeo.`);
  for (const [i, l] of d.legendas_na_tela.entries()) {
    if (l.fim <= l.inicio) out.push(`direcao.legendas_na_tela[${i}]: fim precisa ser depois do início.`);
    if (l.inicio > opts.durationSeconds + 2) out.push(`direcao.legendas_na_tela[${i}]: começa depois do fim do vídeo.`);
  }
  const own = d.musica ? opts.ownMusic?.find((m) => ownMusicId(m.id) === d.musica!.id) : undefined;
  if (d.musica && own) {
    if (opts.business && !own.comercial) out.push(`direcao.musica: "${own.titulo}" (música própria) não tem licença comercial declarada — conta de empresa não pode usar.`);
    if (d.musica.saida !== null && d.musica.saida <= d.musica.entrada) out.push("direcao.musica: saída precisa ser depois da entrada.");
  } else if (d.musica) {
    const track: MusicTrack | undefined = trackById(d.musica.id);
    if (!track) out.push(`direcao.musica.id "${d.musica.id}" não existe na biblioteca — use listar_musicas.`);
    else if (opts.business && track.license !== "comercial") out.push(`direcao.musica: "${track.title}" não tem licença comercial — conta de empresa só usa a biblioteca comercial.`);
    if (d.musica.saida !== null && d.musica.saida <= d.musica.entrada) out.push("direcao.musica: saída precisa ser depois da entrada.");
  }
  if (d.capa && d.capa.frame > opts.durationSeconds + 2) out.push("direcao.capa.frame: depois do fim do vídeo.");
  return out;
}

/** Takes com fala, na ordem — viram as partes que o criador grava. */
export function spokenTakes(d: Direction | null | undefined): DirectionTake[] {
  return (d?.takes ?? []).filter((t) => t.fala_exata.trim()).sort((a, b) => a.ordem - b.ordem);
}

/** Instruções de um take numa linha para a tela de gravação (só o que veio preenchido). */
export function takeInstructions(t: DirectionTake): { label: string; value: string }[] {
  const rows: [string, string][] = [
    ["Ritmo", t.ritmo], ["Enquadramento", t.enquadramento], ["Câmera", t.movimento_camera], ["Local", t.local], ["Luz", t.luz],
    ["Olhar", t.olhar], ["Emoção", t.emocao], ["B-roll", t.broll], ["Cuidado", t.erro_comum],
  ];
  return rows.filter(([, v]) => v.trim()).map(([label, value]) => ({ label, value }));
}

/**
 * O que o app e a montagem fazem com cada parte da direção — e o que NÃO é aplicado (dito com clareza,
 * para o diretor não supor que algo foi feito).
 */
export function directionReport(d: Direction): { campo: string; aplicado: boolean; como: string }[] {
  const spoken = spokenTakes(d);
  const silent = d.takes.filter((t) => !t.fala_exata.trim());
  const out: { campo: string; aplicado: boolean; como: string }[] = [
    { campo: "takes (fala_exata)", aplicado: spoken.length > 0, como: spoken.length ? `${spoken.length} parte(s) gravada(s) na ordem, com teleprompter da fala_exata: ${spoken.map((t) => t.nome).join(" → ")}` : "nenhum take com fala — o app grava o roteiro (script) por partes" },
    { campo: "takes (instruções)", aplicado: spoken.some((t) => takeInstructions(t).length > 0), como: "enquadramento, câmera, local, luz, olhar, emoção, B-roll e erro comum aparecem na tela de gravação de cada take" },
  ];
  if (silent.length) out.push({ campo: "takes sem fala", aplicado: false, como: `${silent.length} take(s) sem fala aparecem como instrução no conteúdo, mas não viram parte do vídeo — grave como cena de apoio (B-roll) do dia para a montagem usar` });
  if (d.legendas_na_tela.length) {
    out.push({ campo: "legendas_na_tela", aplicado: true, como: `${d.legendas_na_tela.length} texto(s) na tela nos tempos e posições pedidos (substituem o gancho automático)` });
    if (d.legendas_na_tela.some((l) => l.estilo.trim())) out.push({ campo: "legendas_na_tela[].estilo", aplicado: false, como: "o estilo é sempre a letra manuscrita do perfil; o texto de estilo fica só como referência" });
  }
  if (d.musica) {
    const track = trackById(d.musica.id);
    out.push({ campo: "musica", aplicado: Boolean(track), como: track ? `"${track.title}" com volume ${Math.round(d.musica.volume * 100)}%, entrando em ${d.musica.entrada}s${d.musica.saida !== null ? ` e saindo em ${d.musica.saida}s` : ""}; abaixa sozinha quando há fala (ducking). Vale se a música do vídeo estiver em “automática” no app` : "id fora da biblioteca — o vídeo sai com a música automática" });
  }
  if (d.edicao.cortes || d.edicao.transicao || d.edicao.zoom) out.push({ campo: "edicao", aplicado: false, como: "cortes de pausa, transições e zoom são automáticos; o texto de edição aparece no app como orientação" });
  if (d.capa) out.push({ campo: "capa", aplicado: true, como: `capa tirada do segundo ${d.capa.frame}${d.capa.texto ? ` com o texto “${d.capa.texto}”` : ""}` });
  if (d.publicacao_por_rede.length) out.push({ campo: "publicacao_por_rede", aplicado: false, como: "horário, hashtags e 1º comentário aparecem no app para o criador copiar; o app não agenda nem posta sozinho" });
  if (d.teste_ab) out.push({ campo: "teste_ab", aplicado: false, como: "os ganchos aparecem no app; o vídeo usa o gancho escolhido pelo criador (não gera 3 versões)" });
  return out;
}

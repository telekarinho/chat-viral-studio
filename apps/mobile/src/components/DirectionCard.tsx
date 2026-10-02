import { Text, View } from "react-native";
import { MOOD_LABEL, PLATFORM_LABEL, takeInstructions, trackById, type Direction, type DirectionTake } from "@postai/domain";
import { Card, Section, colors, s } from "../ui";

const sec = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)}s`;

/** A direção do assistente: tudo o que o criador precisa para gravar, e o que a montagem vai fazer. */
export function DirectionCard({ d }: { d: Direction }) {
  const takes = [...d.takes].sort((a, b) => a.ordem - b.ordem);
  const track = d.musica ? trackById(d.musica.id) : undefined;
  return (
    <>
      <Section>{`Direção — ${takes.length} ${takes.length === 1 ? "take" : "takes"}`}</Section>
      {takes.map((t) => (
        <Card key={t.ordem} style={{ gap: 4 }} testID={`direction-take-${t.ordem}`}>
          <Text style={{ fontWeight: "900", color: colors.ink }}>{`Take ${t.ordem} — ${t.nome} · ${sec(t.duracao_segundos)}${t.fala_exata.trim() ? "" : " · sem fala"}`}</Text>
          {t.fala_exata.trim() ? <Text style={s.body}>{`“${t.fala_exata}”`}</Text> : null}
          {takeInstructions(t).map((i) => (
            <Text key={i.label} style={s.muted}><Text style={{ fontWeight: "800" }}>{`${i.label}: `}</Text>{i.value}</Text>
          ))}
        </Card>
      ))}
      <Card style={{ gap: 6 }} testID="direction-edit">
        {d.legendas_na_tela.length ? (
          <View>
            <Text style={s.label}>Texto na tela</Text>
            {d.legendas_na_tela.map((l, i) => <Text key={i} style={s.body}>{`${sec(l.inicio)}–${sec(l.fim)} · ${l.posicao} · ${l.texto}`}</Text>)}
          </View>
        ) : null}
        {d.musica ? (
          <Text style={s.body}>
            {`🎵 ${track ? `${track.title} — ${track.artist}` : d.musica.id} · ${track ? MOOD_LABEL[track.mood] : d.musica.clima} · volume ${Math.round(d.musica.volume * 100)}% · entra ${sec(d.musica.entrada)}${d.musica.saida !== null ? `, sai ${sec(d.musica.saida)}` : ""}`}
          </Text>
        ) : null}
        {[d.edicao.cortes, d.edicao.transicao, d.edicao.zoom].some(Boolean) ? (
          <Text style={s.muted}>{["Cortes: " + d.edicao.cortes, "Transição: " + d.edicao.transicao, "Zoom: " + d.edicao.zoom].filter((x) => !x.endsWith(": ")).join(" · ")}</Text>
        ) : null}
        {d.capa ? <Text style={s.body}>{`🖼 Capa: quadro de ${sec(d.capa.frame)}${d.capa.texto ? ` com “${d.capa.texto}”` : ""}`}</Text> : null}
        {d.teste_ab ? (
          <View>
            <Text style={s.label}>{`Teste A/B${d.teste_ab.metrica ? ` (medir: ${d.teste_ab.metrica})` : ""}`}</Text>
            {d.teste_ab.ganchos.map((g, i) => <Text key={i} style={s.body}>{`${"ABC"[i]}. ${g}`}</Text>)}
          </View>
        ) : null}
      </Card>
      {d.publicacao_por_rede.length ? (
        <Card style={{ gap: 6 }} testID="direction-publish">
          <Text style={s.label}>Quando e como postar</Text>
          {d.publicacao_por_rede.map((p) => (
            <View key={p.rede}>
              <Text style={{ fontWeight: "800", color: colors.ink }}>{`${PLATFORM_LABEL[p.rede]} · ${p.horario}`}</Text>
              {p.hashtags.length ? <Text style={s.muted} selectable>{p.hashtags.join(" ")}</Text> : null}
              {p.primeiro_comentario ? <Text style={s.muted} selectable>{`1º comentário: ${p.primeiro_comentario}`}</Text> : null}
            </View>
          ))}
        </Card>
      ) : null}
    </>
  );
}

/** Cena de apoio dirigida (B-roll da empresa): cada take com a instrução de filmagem. */
export function ScenesCard({ takes }: { takes: readonly DirectionTake[] }) {
  return (
    <>
      <Section>{`Cenas para filmar (${takes.length})`}</Section>
      {[...takes].sort((a, b) => a.ordem - b.ordem).map((t) => (
        <Card key={t.ordem} style={{ gap: 4 }} testID={`scene-take-${t.ordem}`}>
          <Text style={{ fontWeight: "900", color: colors.ink }}>{`${t.ordem}. ${t.nome} · ${sec(t.duracao_segundos)}`}</Text>
          {t.fala_exata.trim() ? <Text style={s.body}>{`“${t.fala_exata}”`}</Text> : null}
          {takeInstructions(t).map((i) => (
            <Text key={i.label} style={s.muted}><Text style={{ fontWeight: "800" }}>{`${i.label}: `}</Text>{i.value}</Text>
          ))}
        </Card>
      ))}
    </>
  );
}

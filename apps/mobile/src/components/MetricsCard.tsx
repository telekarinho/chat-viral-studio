import { useState } from "react";
import { Text, TextInput, View } from "react-native";
import { METRIC_FIELDS, METRIC_LABEL, engagementRate, parseMetric, type MetricField, type PostMetrics } from "@postai/domain";
import { setContentMetrics, type ContentItem } from "../db/repo";
import { Button, Card, colors, s } from "../ui";

type Form = Record<MetricField, string>;

const toForm = (m: PostMetrics | null | undefined): Form =>
  Object.fromEntries(METRIC_FIELDS.map((f) => [f, m ? String(m[f]) : ""])) as Form;

/** "Como foi este post?": o criador anota os números (soma das redes) e o app aprende o que funciona. */
export function MetricsCard({ content, onSaved }: { content: ContentItem; onSaved: (c: ContentItem) => void }) {
  const [form, setForm] = useState<Form>(toForm(content.metrics));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const parsed = METRIC_FIELDS.map((f) => [f, parseMetric(form[f])] as const);
  const invalid = parsed.filter(([, v]) => v === null).map(([f]) => METRIC_LABEL[f]);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const m = { ...Object.fromEntries(parsed), updatedAt: new Date().toISOString() } as PostMetrics;
      onSaved(await setContentMetrics(content.id, m));
      setMsg(`Salvo. Engajamento: ${(engagementRate(m) * 100).toFixed(1)}%. Veja a comparação em Resultados.`);
    } catch (e) {
      setMsg(`Não consegui salvar: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card style={{ gap: 8 }} testID="metrics-card">
      <Text style={{ fontWeight: "900", color: colors.ink }}>Como foi este post?</Text>
      <Text style={s.muted}>Depois de 1–2 dias, anote os números (somando as redes onde postou). Pode escrever 1.200 ou 3k.</Text>
      {METRIC_FIELDS.map((f) => (
        <View key={f} style={[s.row, { alignItems: "center", gap: 8 }]}>
          <Text style={[s.body, { flex: 1 }]}>{METRIC_LABEL[f]}</Text>
          <TextInput testID={`metric-${f}`} accessibilityLabel={METRIC_LABEL[f]} style={[s.input, { width: 130, textAlign: "right" }]} keyboardType="numeric"
            value={form[f]} onChangeText={(v) => setForm({ ...form, [f]: v })} placeholder="0" />
        </View>
      ))}
      {invalid.length ? <Text style={{ color: colors.bad }}>{`Não entendi: ${invalid.join(", ")}. Use só números (ex.: 1.200 ou 3k).`}</Text> : null}
      <Button compact label="SALVAR NÚMEROS" loading={busy} disabled={invalid.length > 0} onPress={() => void save()} testID="metrics-save" />
      {msg ? <Text style={{ color: colors.good, fontWeight: "700" }} accessibilityLiveRegion="polite">{msg}</Text> : null}
    </Card>
  );
}

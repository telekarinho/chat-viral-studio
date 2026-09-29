import { useState } from "react";
import { Switch, Text, View } from "react-native";
import { router } from "expo-router";
import {
  PRODUCTION_MODES, USE_TARGET_LABEL, commercialBlockers, isBusiness, pendingClaimsIn, type ClipMeta, type ClipReview, type UseTarget,
} from "@postai/domain";
import { clearReviewFlag, deriveContent, flagDerived, updateTakeMeta, type ContentItem, type Take, type Workspace } from "../db/repo";
import { Button, Card, Chip, Section, colors, s } from "../ui";

const CHECKS: { key: keyof Omit<ClipReview, "revisadoEm">; label: string }[] = [
  { key: "falaConfere", label: "A fala confere com o roteiro" },
  { key: "legendaConfere", label: "A legenda confere com a fala" },
  { key: "equipamentoEhOSku", label: "O mixer que aparece É o SKU associado" },
  { key: "ingredientesConferem", label: "Ingredientes e medidas conferem com a receita" },
  { key: "resultadoOk", label: "Resultado (textura/copo) aprovado" },
  { key: "ctaOk", label: "CTA aprovado" },
];

/**
 * Projeto do estúdio: dados do que foi filmado, revisão (roteiro × fala × legenda × equipamento × ingredientes × resultado × CTA),
 * trava de uso comercial e peças derivadas com origem.
 */
export function ProjectPanel({ c, ws, takes, onChange }: { c: ContentItem; ws: Workspace; takes: Take[]; onChange: () => void }) {
  const p = c.project!;
  const live = takes.filter((t) => !t.tags.includes("descartado"));
  const meta: ClipMeta = live[0]?.meta ?? { mode: p.mode, sku: p.sku, fonteSorvete: p.fonteSorvete };
  const [review, setReview] = useState<Omit<ClipReview, "revisadoEm">>(() => ({
    falaConfere: meta.review?.falaConfere ?? false, legendaConfere: meta.review?.legendaConfere ?? false, equipamentoEhOSku: meta.review?.equipamentoEhOSku ?? null,
    ingredientesConferem: meta.review?.ingredientesConferem ?? false, resultadoOk: meta.review?.resultadoOk ?? false, ctaOk: meta.review?.ctaOk ?? false,
  }));
  const [perm, setPerm] = useState(meta.permissoes ?? { imagemPessoas: false, marcasTerceiros: true });
  const [target, setTarget] = useState<UseTarget>(p.derivedTarget ?? (p.mode === "aula" ? "aula" : p.mode === "marketplace" ? "marketplace" : "curto_redes"));
  const [busy, setBusy] = useState<string | null>(null);

  const script = c.draft ? `${c.draft.script} ${c.draft.cta}` : "";
  const claims = isBusiness(ws.profile) ? pendingClaimsIn(script, ws.profile.business.pendingClaims ?? []) : [];
  const saved = live.length > 0 && live.every((t) => t.meta.review);
  const blockers = live.length ? commercialBlockers(meta, target, claims) : ["Nenhum take gravado ainda."];

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    try { await fn(); onChange(); } finally { setBusy(null); }
  }

  async function saveReview() {
    const r: ClipReview = { ...review, revisadoEm: new Date().toISOString() };
    const skuWrong = review.equipamentoEhOSku === false;
    for (const t of live) await updateTakeMeta(t.id, { meta: { review: r, permissoes: perm } });
    // equipamento errado na origem: todas as peças derivadas precisam de revisão
    if (skuWrong) await flagDerived(c.id, "O mixer do vídeo não é o SKU associado — corrigir a associação.");
    else if (c.precisaRevisao) await clearReviewFlag(c.id);
  }

  return (
    <View style={{ gap: 8 }} testID="project-panel">
      <Card style={{ gap: 4 }}>
        <Text style={s.label}>{PRODUCTION_MODES[p.mode].label}</Text>
        <Text style={s.body}>{`🎥 ${p.skuNome ?? p.sku ?? "sem SKU"}${p.sku && p.skuNome ? ` · SKU ${p.sku}` : ""}`}</Text>
        <Text style={s.muted}>{`Sorvete: ${p.fonteSorvete}${p.aulaTitulo ? ` · Aula: ${p.aulaTitulo}` : ""}${p.derivedTarget ? ` · Peça: ${USE_TARGET_LABEL[p.derivedTarget]}` : ""}`}</Text>
        {c.derivedFrom ? <Text style={s.muted} onPress={() => router.push(`/content/${c.derivedFrom}`)}>↩ Derivado de outra gravação (toque para abrir a origem)</Text> : null}
      </Card>
      {c.precisaRevisao ? <Card style={{ backgroundColor: "#FFF1F0" }}><Text style={{ color: colors.bad, fontWeight: "800" }}>{`⚠ Precisa de revisão: ${c.precisaRevisao}`}</Text></Card> : null}

      <Section>Revisão do vídeo</Section>
      <Card style={{ gap: 8 }}>
        {CHECKS.map((k) => (
          <View key={k.key} style={[s.row, { justifyContent: "space-between" }]}>
            <Text style={[s.body, { flex: 1 }]}>{k.label}</Text>
            <Switch value={review[k.key] === true} onValueChange={(v) => setReview({ ...review, [k.key]: v })} accessibilityLabel={k.label} />
          </View>
        ))}
        {review.equipamentoEhOSku !== true ? (
          <Button compact variant="secondary" label="O MIXER NO VÍDEO É OUTRO" onPress={() => setReview({ ...review, equipamentoEhOSku: false })} />
        ) : null}
        <View style={[s.row, { justifyContent: "space-between" }]}>
          <Text style={[s.body, { flex: 1 }]}>Pessoas que aparecem autorizaram o uso da imagem</Text>
          <Switch value={perm.imagemPessoas} onValueChange={(v) => setPerm({ ...perm, imagemPessoas: v })} accessibilityLabel="Autorização de imagem" />
        </View>
        <View style={[s.row, { justifyContent: "space-between" }]}>
          <Text style={[s.body, { flex: 1 }]}>Sem marca de terceiros (ou com direito de uso)</Text>
          <Switch value={perm.marcasTerceiros} onValueChange={(v) => setPerm({ ...perm, marcasTerceiros: v })} accessibilityLabel="Marcas de terceiros" />
        </View>
        <Button compact label={saved ? "ATUALIZAR REVISÃO" : "SALVAR REVISÃO"} disabled={!live.length} loading={busy === "rev"} onPress={() => void run("rev", saveReview)} testID="save-review" />
      </Card>

      <Section>Usar em</Section>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {(Object.keys(USE_TARGET_LABEL) as UseTarget[]).map((t) => <Chip key={t} label={USE_TARGET_LABEL[t]} selected={t === target} onPress={() => setTarget(t)} />)}
      </View>
      {blockers.length ? (
        <Card style={{ backgroundColor: "#FFF8E8", gap: 4 }} testID="commercial-blockers">
          <Text style={{ fontWeight: "800", color: colors.warn }}>🔒 Bloqueado para uso comercial</Text>
          {blockers.map((b) => <Text key={b} style={s.muted}>{`• ${b}`}</Text>)}
        </Card>
      ) : (
        <Card><Text style={{ color: colors.good, fontWeight: "800" }}>{`✓ Liberado para ${USE_TARGET_LABEL[target]}`}</Text></Card>
      )}
      <Button variant="secondary" label={`CRIAR PEÇA: ${USE_TARGET_LABEL[target].toUpperCase()}`} disabled={blockers.length > 0} loading={busy === "der"}
        onPress={() => void run("der", async () => { const d = await deriveContent(c.id, target); router.push(`/content/${d.id}`); })} testID="derive" />
      <Text style={s.muted}>A peça nova guarda a origem. Se algo mudar aqui (SKU, receita, alegação, imagem), ela é marcada para revisão.</Text>
    </View>
  );
}

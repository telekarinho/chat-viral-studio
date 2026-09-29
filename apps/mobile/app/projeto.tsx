import { useEffect, useState } from "react";
import { Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { PRODUCTION_MODES, SHOT_LIBRARY, type IceCreamSource, type ProductionMode } from "@postai/domain";
import { createProject } from "../src/db/repo";
import { generateForContent } from "../src/generate";
import { useApp } from "../src/app-state";
import { supabase } from "../src/supabase";
import { Button, Card, Chip, ErrorBox, Eyebrow, H1, Screen, Section, s } from "../src/ui";

interface Produto { id: number; sku: string; nome: string }
const FONTES: { key: IceCreamSource; label: string }[] = [
  { key: "expresso", label: "Sorvete expresso" }, { key: "balde", label: "Sorvete de balde" }, { key: "ambos", label: "Os dois" }, { key: "nenhum", label: "Sem sorvete" },
];

/** Estúdio da fábrica: escolhe o modo (A–G), o mixer exato filmado (catálogo MMIX) e a fonte de sorvete. */
export default function NovoProjeto() {
  const params = useLocalSearchParams<{ mode?: ProductionMode; aulaId?: string; aulaTitulo?: string }>();
  const { workspace } = useApp();
  const [mode, setMode] = useState<ProductionMode>(params.mode ?? "demonstracao_mixer");
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [produto, setProduto] = useState<Produto | null>(null);
  const [skuManual, setSkuManual] = useState("");
  const [fonte, setFonte] = useState<IceCreamSource>(PRODUCTION_MODES[params.mode ?? "demonstracao_mixer"].source);
  const [receita, setReceita] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const m = PRODUCTION_MODES[mode];

  useEffect(() => {
    if (!supabase || !workspace?.cloud) return;
    void supabase.from("mmix_produtos").select("id,sku,nome").eq("workspace_id", workspace.id).order("nome").then(({ data }) => setProdutos((data ?? []) as Produto[]));
  }, [workspace]);

  async function criar() {
    setError(null);
    if (m.needsSku && !produto && !skuManual.trim()) return setError("Escolha o mixer exato que vai aparecer no vídeo (ou digite o SKU).");
    setBusy(true);
    try {
      const c = await createProject({
        mode, produtoId: produto?.id ?? null, sku: produto?.sku ?? (skuManual.trim() || null), skuNome: produto?.nome ?? null, fonteSorvete: fonte,
        receita: receita.trim() || null, aulaId: params.aulaId ?? null, aulaTitulo: params.aulaTitulo ?? null,
      }, `${m.label.split(" · ")[1]}${produto ? ` — ${produto.nome}` : ""}${params.aulaTitulo ? ` — ${params.aulaTitulo}` : ""}`.slice(0, 120));
      await generateForContent(c.id);
      router.replace(`/content/${c.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen testID="projeto-screen">
      <Button variant="ghost" compact label="← Voltar" onPress={() => router.back()} />
      <Eyebrow>Estúdio da fábrica</Eyebrow>
      <H1>Novo projeto</H1>
      {error ? <ErrorBox message={error} /> : null}

      <Section>O que vamos gravar</Section>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {(Object.keys(PRODUCTION_MODES) as ProductionMode[]).map((k) => (
          <Chip key={k} label={PRODUCTION_MODES[k].label} selected={k === mode} onPress={() => { setMode(k); setFonte(PRODUCTION_MODES[k].source); }} testID={`mode-${k}`} />
        ))}
      </View>
      <Card style={{ gap: 6 }}>
        <Text style={s.body}>{m.objetivo}</Text>
        {m.guard.map((g) => <Text key={g} style={s.muted}>{`🔒 ${g}`}</Text>)}
      </Card>

      <Section>{m.needsSku ? "Mixer filmado (SKU exato)" : "Mixer filmado (opcional)"}</Section>
      {produtos.length ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {produtos.map((p) => <Chip key={p.id} label={p.nome} selected={produto?.id === p.id} onPress={() => setProduto(produto?.id === p.id ? null : p)} />)}
        </View>
      ) : (
        <Text style={s.muted}>O catálogo MMIX ainda não chegou neste perfil (atualiza a cada 5 min). Digite o SKU da etiqueta do mixer:</Text>
      )}
      {!produtos.length ? <TextInput style={s.input} value={skuManual} onChangeText={setSkuManual} placeholder="SKU do mixer" autoCapitalize="characters" accessibilityLabel="SKU do mixer" /> : null}

      <Section>Fonte de sorvete</Section>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {FONTES.map((f) => <Chip key={f.key} label={f.label} selected={fonte === f.key} onPress={() => setFonte(f.key)} />)}
      </View>

      <Section>Receita / demonstração (só valores aprovados)</Section>
      <TextInput style={[s.input, { minHeight: 80, textAlignVertical: "top" }]} multiline value={receita} onChangeText={setReceita}
        placeholder="Ex.: ficha aprovada do milk-shake de morango. Deixe em branco se ainda não tem — a IA não inventa medida nem tempo." accessibilityLabel="Receita" />

      <Section>Tomadas deste projeto</Section>
      <Card style={{ gap: 4 }}>
        {m.shots.map((k, i) => <Text key={k} style={s.body}>{`${i + 1}. ${SHOT_LIBRARY[k].label} — ${SHOT_LIBRARY[k].hint}`}</Text>)}
      </Card>

      <Button label="CRIAR PROJETO E ROTEIRO" loading={busy} onPress={() => void criar()} testID="projeto-criar" />
    </Screen>
  );
}

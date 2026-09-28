import { useEffect, useState } from "react";
import { Linking, Text, TextInput } from "react-native";
import * as Clipboard from "expo-clipboard";
import { router, useLocalSearchParams } from "expo-router";
import { buildManualPrompt, summarizeForMemory } from "@postai/domain";
import { getContent, listRecentContent, requireWorkspace } from "../../src/db/repo";
import { importManualDraft } from "../../src/generate";
import { Button, Card, ErrorBox, Eyebrow, H1, Screen, Section, s } from "../../src/ui";

/**
 * Uses the creator's own ChatGPT/Claude subscription without API keys: copy the prompt, paste it in the
 * assistant's app, paste the JSON answer back. The answer is validated by the same contract.
 */
export default function ManualAssistant() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [prompt, setPrompt] = useState("");
  const [pasted, setPasted] = useState("");
  const [copied, setCopied] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const [c, ws, recent] = await Promise.all([getContent(id), requireWorkspace(), listRecentContent(10)]);
      if (!c || (c.format !== "thought" && c.format !== "main_video")) return;
      const pillar = ws.pillars.find((p) => p.slug === c.pillarSlug)?.name ?? c.pillarSlug;
      const summaries = recent.filter((r) => r.draft && r.id !== id).map((r) => summarizeForMemory(r.draft!));
      setPrompt(buildManualPrompt({ profile: ws.profile, pillarName: pillar, format: c.format, eventText: null, recentSummaries: summaries, avoid: "" }));
    })();
  }, [id]);

  async function importIt() {
    setBusy(true);
    const r = await importManualDraft(id, pasted);
    setBusy(false);
    if (!r.ok) return setErrors(r.errors);
    router.replace(`/content/${id}`);
  }

  return (
    <Screen testID="manual-screen">
      <Button variant="ghost" compact label="← Voltar" onPress={() => router.back()} />
      <Eyebrow>Sem custo de API</Eyebrow>
      <H1>Usar meu ChatGPT ou Claude</H1>
      <Text style={s.muted}>1. Copie o pedido. 2. Cole no app do ChatGPT ou do Claude. 3. Copie a resposta inteira e cole aqui embaixo.</Text>
      <Button label={copied ? "PEDIDO COPIADO ✓" : "1. COPIAR PEDIDO"} disabled={!prompt} onPress={async () => { await Clipboard.setStringAsync(prompt); setCopied(true); }} />
      <Card style={{ gap: 8 }}>
        <Button compact variant="secondary" label="ABRIR CHATGPT" onPress={() => Linking.openURL("https://chatgpt.com/")} />
        <Button compact variant="secondary" label="ABRIR CLAUDE" onPress={() => Linking.openURL("https://claude.ai/new")} />
      </Card>
      <Section>3. Cole a resposta</Section>
      <TextInput style={[s.input, { minHeight: 200, textAlignVertical: "top" }]} multiline value={pasted} onChangeText={setPasted} placeholder="Cole aqui a resposta (JSON)" accessibilityLabel="Resposta do assistente" />
      <Button compact variant="ghost" label="COLAR DA ÁREA DE TRANSFERÊNCIA" onPress={async () => setPasted(await Clipboard.getStringAsync())} />
      {errors.length ? <ErrorBox message={errors.slice(0, 4).join("\n")} /> : null}
      <Button label="USAR ESTE ROTEIRO" onPress={importIt} disabled={!pasted.trim()} loading={busy} />
    </Screen>
  );
}

import { useState } from "react";
import { Text, TextInput } from "react-native";
import { router } from "expo-router";
import { pickNextPillar } from "@postai/domain";
import { createAdHocContent, donePillarSlugs, requireWorkspace } from "../src/db/repo";
import { generateForContent } from "../src/generate";
import { Button, Chip, ErrorBox, Eyebrow, H1, Screen, Section, s } from "../src/ui";
import { useApp } from "../src/app-state";

/** "Aconteceu algo hoje?" → structured content (keeps the facts, finds the E → MAS → POR ISSO). */
export default function EventScreen() {
  const { workspace } = useApp();
  const [text, setText] = useState("");
  const [format, setFormat] = useState<"thought" | "main_video">("main_video");
  const [pillar, setPillar] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const ws = await requireWorkspace();
      const slug = pillar ?? pickNextPillar(ws.pillars, await donePillarSlugs()).slug;
      const c = await createAdHocContent(format, slug, "Acontecimento de hoje");
      await generateForContent(c.id, text.trim());
      router.replace(`/content/${c.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen testID="event-screen">
      <Button variant="ghost" compact label="← Voltar" onPress={() => router.back()} />
      <Eyebrow>Vida real vira conteúdo</Eyebrow>
      <H1>Aconteceu algo hoje?</H1>
      <Text style={s.muted}>Conta do seu jeito, em poucas linhas. Eu mantenho os fatos e monto o roteiro.</Text>
      <TextInput
        testID="event-input"
        style={[s.input, { minHeight: 140, textAlignVertical: "top" }]}
        multiline
        maxLength={1500}
        value={text}
        onChangeText={setText}
        placeholder="Ex.: hoje meu filho me perguntou por que eu acordo tão cedo pra treinar…"
        accessibilityLabel="O que aconteceu"
      />
      <Section>Formato</Section>
      <Text style={s.muted}>Evite nomes e rostos de crianças no vídeo.</Text>
      <Chip label="Vídeo principal" selected={format === "main_video"} onPress={() => setFormat("main_video")} />
      <Chip label="Pensamento do Dia" selected={format === "thought"} onPress={() => setFormat("thought")} />
      <Section>Pilar (opcional)</Section>
      {workspace?.pillars.map((p) => <Chip key={p.slug} label={p.name} selected={pillar === p.slug} onPress={() => setPillar(pillar === p.slug ? null : p.slug)} />)}
      {error ? <ErrorBox message={error} /> : null}
      <Button testID="event-generate" label="TRANSFORMAR EM ROTEIRO" onPress={create} loading={busy} disabled={text.trim().length < 10} />
    </Screen>
  );
}

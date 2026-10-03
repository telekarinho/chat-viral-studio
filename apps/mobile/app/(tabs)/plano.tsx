import { useCallback, useState } from "react";
import { Switch, Text, TextInput, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { FORMAT_LABEL, isValidTime, pillarBalance, validatePillarTargets, type Pillar, type RoutineBlock } from "@postai/domain";
import { useApp } from "../../src/app-state";
import { donePillarSlugs, updatePillars, updateRoutineBlock } from "../../src/db/repo";
import { PillarEditor } from "../../src/components/PillarEditor";
import { Button, Card, Chip, ErrorBox, Eyebrow, H1, Screen, Section, colors, s } from "../../src/ui";

const DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export default function Plano() {
  const { workspace, reload } = useApp();
  const [pillars, setPillars] = useState<Pillar[]>(workspace?.pillars ?? []);
  const [recent, setRecent] = useState<string[]>([]);
  const [day, setDay] = useState(new Date().getDay() || 1);
  const [msg, setMsg] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    setPillars(workspace?.pillars ?? []);
    void donePillarSlugs().then(setRecent);
  }, [workspace]));

  if (!workspace) return null;
  const dirty = JSON.stringify(pillars) !== JSON.stringify(workspace.pillars);
  const errors = validatePillarTargets(pillars);
  const balance = pillarBalance(workspace.pillars, recent);
  const blocks = workspace.routine.filter((b) => b.weekday === day).sort((a, b) => a.startTime.localeCompare(b.startTime));

  async function savePillars() {
    await updatePillars(pillars);
    await reload();
    setMsg("Pilares salvos. Os próximos dias já usam os novos percentuais.");
  }

  return (
    <Screen testID="plano-screen">
      <View style={[s.row, { justifyContent: "space-between" }]}>
        <Eyebrow>{`Perfil: ${workspace.name}`}</Eyebrow>
        <Button compact variant="ghost" label="Configurações" onPress={() => router.push("/settings")} testID="open-settings" />
      </View>
      <H1>Estratégia</H1>
      <Text style={s.muted}>Aqui você configura uma vez. A tela Hoje executa o plano todo dia.</Text>

      <Section>Perfil</Section>
      <Card style={{ gap: 4 }} testID="strategy-profile">
        <Text style={{ fontWeight: "900", color: colors.ink }}>{`${workspace.profile.kind === "empresa" ? "🏭" : "🙂"} ${workspace.profile.displayName}`}</Text>
        <Text style={s.body}>{workspace.profile.positioning}</Text>
        <Button compact variant="ghost" label="Perfis e dados" onPress={() => router.push("/perfis")} testID="open-profiles" />
      </Card>

      <Section>Estratégia: equilíbrio dos últimos conteúdos</Section>
      <Card style={{ gap: 8 }}>
        {recent.length === 0 ? <Text style={s.muted}>Ainda sem conteúdos gravados. O plano começa pelos pilares com maior meta.</Text> : null}
        {balance.map((b) => (
          <View key={b.slug} style={[s.row, { justifyContent: "space-between" }]}>
            <Text style={{ flex: 1, color: colors.ink, fontWeight: "700" }}>{b.name}</Text>
            <Text style={{ color: b.deficit > 5 ? colors.warn : colors.muted, fontWeight: "800" }}>{Math.round(b.actualPercent)}% / meta {b.targetPercent}%</Text>
          </View>
        ))}
      </Card>

      <Section>Pilares e percentuais</Section>
      <PillarEditor pillars={pillars} onChange={setPillars} />
      {msg ? <Card><Text style={{ color: colors.good, fontWeight: "700" }}>{msg}</Text></Card> : null}
      {dirty ? <Button label="SALVAR PILARES" onPress={savePillars} disabled={errors.length > 0} testID="save-pillars" /> : null}

      <Section>Rotina, horários e obrigatoriedade</Section>
      <View style={s.row}>{DAYS.map((d, i) => <Chip key={d} label={d} selected={i === day} onPress={() => setDay(i)} />)}</View>
      {blocks.length === 0 ? <Card><Text style={s.muted}>Sem missões neste dia.</Text></Card> : null}
      {blocks.map((b) => <BlockRow key={b.id} block={b} onSave={async (nb) => { await updateRoutineBlock(nb); await reload(); }} />)}
      <Text style={s.muted}>Mudanças de horário valem a partir do próximo dia planejado. A chave liga/desliga se a missão é obrigatória.</Text>

      <Section>Plataformas</Section>
      <Card><Text style={s.body} testID="strategy-networks">{workspace.profile.extras?.networks?.length ? workspace.profile.extras.networks.join(" · ") : "Instagram · TikTok · YouTube Shorts (padrão). Peça ao Claude para ajustar o perfil se quiser outras."}</Text></Card>

      <Section>Diretor e regras</Section>
      <Card style={{ gap: 4 }} testID="strategy-rules">
        {workspace.profile.voiceRules.map((r) => <Text key={r} style={s.body}>{`• ${r}`}</Text>)}
        {workspace.profile.closingPhrase ? <Text style={s.body}>{`• Fecha com “${workspace.profile.closingPhrase}”`}</Text> : null}
        {workspace.profile.kind === "empresa" && workspace.profile.business?.noPrice ? <Text style={s.body}>• Nunca falar preço</Text> : null}
        {workspace.profile.kind === "empresa" ? (workspace.profile.business?.pendingClaims ?? []).map((c) => <Text key={c} style={s.body}>{`• Não afirmar sem prova: ${c}`}</Text>) : null}
        <Text style={s.muted}>O Diretor (Claude) segue estas regras. Conectar ou trocar o link do Claude: Configurações.</Text>
      </Card>
    </Screen>
  );
}

function BlockRow({ block, onSave }: { block: RoutineBlock; onSave: (b: RoutineBlock) => Promise<void> }) {
  const [time, setTime] = useState(block.startTime);
  const [error, setError] = useState<string | null>(null);
  const changed = time !== block.startTime;
  return (
    <Card>
      <View style={[s.row, { justifyContent: "space-between" }]}>
        <TextInput style={[s.input, { width: 86, minHeight: 44, padding: 8, textAlign: "center" }]} value={time} onChangeText={setTime} keyboardType="numbers-and-punctuation" maxLength={5} accessibilityLabel={`Horário de ${block.title}`} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: "800", color: colors.ink }}>{block.title}</Text>
          <Text style={s.muted}>{FORMAT_LABEL[block.format]}</Text>
        </View>
        <Switch value={!block.optional} onValueChange={(v) => void onSave({ ...block, optional: !v })} accessibilityLabel={`${block.title} obrigatório`} />
      </View>
      {changed ? (
        <Button compact label="SALVAR HORÁRIO" onPress={async () => {
          if (!isValidTime(time)) return setError("Use o formato HH:MM, ex.: 19:30");
          setError(null);
          await onSave({ ...block, startTime: time });
        }} />
      ) : null}
      {error ? <ErrorBox message={error} /> : null}
    </Card>
  );
}

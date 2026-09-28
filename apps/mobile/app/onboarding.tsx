import { useState } from "react";
import { Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { validatePillarTargets } from "@postai/domain";
import { useApp } from "../src/app-state";
import { cloudEnabled } from "../src/config";
import { defaultOnboarding, setupWorkspace } from "../src/workspace-setup";
import { Button, Card, ErrorBox, Eyebrow, H1, Screen, Section, s } from "../src/ui";
import { PillarEditor } from "../src/components/PillarEditor";

export default function Onboarding() {
  const { reload } = useApp();
  const [form, setForm] = useState(defaultOnboarding);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errors = validatePillarTargets(form.pillars);
  const setProfile = (k: "displayName" | "signature" | "closingPhrase" | "positioning", v: string) => setForm({ ...form, profile: { ...form.profile, [k]: v } });

  async function finish() {
    setError(null);
    if (!form.profile.displayName.trim()) return setError("Diga como você quer ser chamado.");
    if (errors.length) return setError(errors[0]!);
    setBusy(true);
    try {
      await setupWorkspace({ ...form, profile: { ...form.profile, handle: form.profile.signature } });
      await reload();
      router.replace("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen testID="onboarding-screen">
      <Eyebrow>Primeiros passos</Eyebrow>
      <H1>Seu jeito de criar</H1>
      <Text style={s.muted}>Já deixamos tudo pronto com o seu perfil. Ajuste o que quiser — dá pra mudar depois em Plano.</Text>

      <Section>Perfil</Section>
      <Card style={{ gap: 10 }}>
        <Field label="Nome" value={form.profile.displayName} onChange={(v) => setProfile("displayName", v)} testID="onb-name" />
        <Field label="Assinatura" value={form.profile.signature} onChange={(v) => setProfile("signature", v)} testID="onb-signature" />
        <Field label="Frase de fechamento (vai no fim de todo roteiro)" value={form.profile.closingPhrase} onChange={(v) => setProfile("closingPhrase", v)} testID="onb-closing" />
        <Field label="Sobre o seu conteúdo" value={form.profile.positioning} onChange={(v) => setProfile("positioning", v)} multiline />
      </Card>

      <Section>Pilares de conteúdo</Section>
      <PillarEditor pillars={form.pillars} onChange={(pillars) => setForm({ ...form, pillars })} />

      <Section>Rotina</Section>
      <Card>
        <Text style={s.body}>Segunda a sexta: café 08:45, pensamento 10:30, fim do expediente 17:30, vídeo principal 19:30, academia 20:15 e mais B-rolls.</Text>
        <Text style={s.muted}>Horários editáveis em Plano → Rotina.</Text>
      </Card>

      <Section>Privacidade</Section>
      <Card>
        <Text style={s.muted}>
          Seus vídeos ficam primeiro no seu celular. {cloudEnabled ? "Depois vão para um armazenamento privado só seu." : "Neste modo nada sai do aparelho."} Não usamos seus
          vídeos para treinar IA e não fazemos reconhecimento facial. Cuidado ao gravar crianças: prefira cenas sem rosto.
        </Text>
      </Card>

      {error ? <ErrorBox message={error} /> : null}
      <View style={{ height: 4 }} />
      <Button testID="onb-finish" label="COMEÇAR MEU DIA" onPress={finish} loading={busy} disabled={errors.length > 0} />
    </Screen>
  );
}

function Field({ label, value, onChange, multiline, testID }: { label: string; value: string; onChange: (v: string) => void; multiline?: boolean; testID?: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput testID={testID} style={[s.input, multiline && { minHeight: 80, textAlignVertical: "top" }]} value={value} onChangeText={onChange} multiline={multiline} accessibilityLabel={label} />
    </View>
  );
}

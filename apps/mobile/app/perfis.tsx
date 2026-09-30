import { useEffect, useState } from "react";
import { Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { PROFILE_TEMPLATES, WATERMARK_CORNERS, WATERMARK_LABEL, isBusiness, watermarkCorner, type BusinessStrategy, type ProfileTemplate, type WatermarkCorner } from "@postai/domain";
import { activateWorkspace, listWorkspaces, updateProfile, type Workspace } from "../src/db/repo";
import { createProfile } from "../src/workspace-setup";
import { useApp } from "../src/app-state";
import { Button, Card, Chip, ErrorBox, Eyebrow, H1, Screen, Section, s } from "../src/ui";

const lines = (xs: readonly string[]) => xs.join("\n");
const parseLines = (t: string) => t.split("\n").map((l) => l.trim()).filter(Boolean);

export default function Perfis() {
  const { workspace, reload } = useApp();
  const [all, setAll] = useState<Workspace[]>([]);
  const [template, setTemplate] = useState<ProfileTemplate>(PROFILE_TEMPLATES[1]!);
  const [name, setName] = useState(PROFILE_TEMPLATES[1]!.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => void listWorkspaces().then(setAll), [workspace?.id]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen testID="profiles-screen">
      <Eyebrow>Um app, vários momentos do dia</Eyebrow>
      <H1>Perfis</H1>
      <Text style={s.muted}>Cada perfil tem voz, pilares, rotina e memória próprios. Pessoal fecha com a sua frase; empresa vende sem falar preço.</Text>
      {error ? <ErrorBox message={error} /> : null}

      <Section>Seus perfis</Section>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {all.map((w) => (
          <Chip key={w.id} label={`${w.profile.kind === "empresa" ? "🏭" : "🙂"} ${w.name}`} selected={w.id === workspace?.id} onPress={() => void run(() => activateWorkspace(w.id))} />
        ))}
      </View>

      <Section>Novo perfil</Section>
      <Card style={{ gap: 10 }}>
        {PROFILE_TEMPLATES.map((t) => (
          <Chip key={t.id} label={t.label} selected={t.id === template.id} onPress={() => { setTemplate(t); setName(t.name); }} testID={`tpl-${t.id}`} />
        ))}
        <Text style={s.muted}>{template.description}</Text>
        <Field label="Nome do perfil" value={name} onChange={setName} testID="profile-name" />
        <Button label="CRIAR E USAR ESTE PERFIL" loading={busy} disabled={!name.trim()} testID="profile-create"
          onPress={() => void run(async () => { await createProfile(template, name.trim()); router.back(); })} />
      </Card>

      {workspace ? (
        <SignatureEditor key={`sig-${workspace.id}`} ws={workspace} busy={busy}
          onSave={(sig, corner) => void run(() => updateProfile({ ...workspace.profile, signature: sig, handle: sig, watermark: corner }, workspace.name))} />
      ) : null}
      {workspace && isBusiness(workspace.profile) ? (
        <StrategyEditor key={workspace.id} ws={workspace} busy={busy} onSave={(b) => void run(() => updateProfile({ ...workspace.profile, business: b }, workspace.name))} />
      ) : null}
    </Screen>
  );
}

/** Assinatura do perfil: vai no fim das legendas do post e no vídeo (num canto o tempo todo + no centro no final). */
function SignatureEditor({ ws, busy, onSave }: { ws: Workspace; busy: boolean; onSave: (signature: string, corner: WatermarkCorner) => void }) {
  const [sig, setSig] = useState(ws.profile.signature);
  const [corner, setCorner] = useState<WatermarkCorner>(watermarkCorner(ws.profile.watermark));
  return (
    <>
      <Section>Assinatura no vídeo — {ws.name}</Section>
      <Card style={{ gap: 10 }} testID="signature-card">
        <Text style={s.muted}>Aparece pequena no canto durante o vídeo todo e grande no final. Também fecha a legenda do post. Cada perfil tem a sua.</Text>
        <Field label="Assinatura (ex.: RodrigoSerra.me, ControlPot)" value={sig} onChange={setSig} testID="signature-input" />
        <Text style={s.label}>Em qual canto do vídeo</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {WATERMARK_CORNERS.map((c) => (
            <Chip key={c} label={WATERMARK_LABEL[c]} selected={c === corner} onPress={() => setCorner(c)} testID={`corner-${c}`} />
          ))}
        </View>
        <Button label="SALVAR ASSINATURA" loading={busy} disabled={!sig.trim()} testID="signature-save" onPress={() => onSave(sig.trim(), corner)} />
      </Card>
    </>
  );
}

function StrategyEditor({ ws, busy, onSave }: { ws: Workspace; busy: boolean; onSave: (b: BusinessStrategy) => void }) {
  const b = ws.profile.business!;
  const [f, setF] = useState({
    product: b.product, audience: b.audience, pains: lines(b.pains), desires: lines(b.desires),
    objections: lines(b.objections.map((o) => `${o.objection} | ${o.answer}`)), proofs: lines(b.proofs), differentiators: lines(b.differentiators), pendingClaims: lines(b.pendingClaims ?? []), ctas: lines(b.ctas),
  });
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });
  const objections = parseLines(f.objections).map((l) => {
    const [objection, ...rest] = l.split("|");
    return { objection: objection!.trim(), answer: rest.join("|").trim() };
  });
  const invalid = objections.some((o) => !o.answer) || !parseLines(f.pains).length || !objections.length || !parseLines(f.proofs).length || !parseLines(f.ctas).length;

  return (
    <>
      <Section>Estratégia de venda — {ws.name}</Section>
      <Card style={{ gap: 10 }}>
        <Text style={s.muted}>A IA usa isso para decidir cada vídeo: UMA dor, UMA objeção, UMA prova. Nunca inventa número nem preço.</Text>
        <Field label="Produto" value={f.product} onChange={set("product")} />
        <Field label="Cliente: alguém que…" value={f.audience} onChange={set("audience")} />
        <Field label="Dores do cliente (uma por linha)" value={f.pains} onChange={set("pains")} multiline />
        <Field label="Desejos (uma por linha)" value={f.desires} onChange={set("desires")} multiline />
        <Field label="Objeções: objeção | resposta (uma por linha)" value={f.objections} onChange={set("objections")} multiline />
        <Field label="Provas visuais para filmar (uma por linha)" value={f.proofs} onChange={set("proofs")} multiline />
        <Field label="Diferenciais COMPROVADOS — a IA pode afirmar (um por linha)" value={f.differentiators} onChange={set("differentiators")} multiline />
        <Field label="Alegações a comprovar — não vão para o vídeo até ter prova (uma por linha)" value={f.pendingClaims} onChange={set("pendingClaims")} multiline />
        <Field label="Chamadas / CTAs (uma por linha)" value={f.ctas} onChange={set("ctas")} multiline />
        {invalid ? <Text style={s.muted}>Preencha dores, provas, chamadas e toda objeção com “| resposta”.</Text> : null}
        <Button label="SALVAR ESTRATÉGIA" loading={busy} disabled={invalid}
          onPress={() => onSave({
            ...b, product: f.product.trim(), audience: f.audience.trim(), pains: parseLines(f.pains), desires: parseLines(f.desires), objections,
            proofs: parseLines(f.proofs), differentiators: parseLines(f.differentiators), pendingClaims: parseLines(f.pendingClaims), ctas: parseLines(f.ctas), noPrice: true,
          })} />
      </Card>
    </>
  );
}

function Field({ label, value, onChange, multiline, testID }: { label: string; value: string; onChange: (v: string) => void; multiline?: boolean; testID?: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput testID={testID} style={[s.input, multiline && { minHeight: 96, textAlignVertical: "top" }]} value={value} onChangeText={onChange} multiline={multiline} accessibilityLabel={label} />
    </View>
  );
}

import { useCallback, useEffect, useState } from "react";
import { Linking, Modal, ScrollView, Text, TextInput, View } from "react-native";
import { describeEditProposal, type ScriptSegment } from "@postai/domain";
import { claudeAskUrl, listDirectorRequests, sendDirectorRequest, type DirectorRequest } from "../directorChat";
import { pullEditProposal, type PendingProposal } from "../editProposals";
import { reportError } from "../telemetry";
import { Button, Card, Chip, colors, s } from "../ui";

const EXAMPLES = ["quero mais rápido", "troca o começo", "mais profissional", "menos cortes", "deixa mais engraçado"];

/**
 * 🎬 Diretor: painel do vídeo atual (não é aba). O que já foi gravado, o que falta, a recomendação, a proposta
 * de montagem e a conversa com o Claude. O pedido vai para o Claude pelo conector; ele responde e propõe.
 */
export function DirectorSheet({ visible, onClose, workspaceId, contentId, segments, recorded, business, cloud }: {
  visible: boolean; onClose: () => void; workspaceId: string; contentId: string;
  segments: ScriptSegment[]; recorded: number[]; business: boolean; cloud: boolean;
}) {
  const [requests, setRequests] = useState<DirectorRequest[]>([]);
  const [proposal, setProposal] = useState<PendingProposal | null>(null);
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const refresh = useCallback(() => {
    void listDirectorRequests(contentId).then(setRequests).catch(() => undefined);
    void pullEditProposal(workspaceId, contentId, business).then(setProposal).catch(() => undefined);
  }, [contentId, workspaceId, business]);
  useEffect(() => { if (visible) refresh(); }, [visible, refresh]);

  const missing = segments.filter((sg) => !recorded.includes(sg.index));
  const recommendation = !segments.length ? "Gere ou peça o roteiro ao Diretor para começar."
    : missing.length ? `Grave ${missing.length === 1 ? "a parte" : "as partes"} ${missing.map((sg) => sg.index + 1).join(", ")} para completar o material.`
      : "Material completo. Veja a proposta e finalize.";

  async function send() {
    const t = text.trim();
    if (t.length < 2) return;
    setSending(true);
    setMsg(null);
    try {
      if (cloud) await sendDirectorRequest(workspaceId, contentId, t);
      setText("");
      setMsg(cloud ? "Pedido enviado. Abrindo o Claude — a resposta aparece aqui." : "Sem nuvem: abrindo o Claude com o seu pedido.");
      await Linking.openURL(claudeAskUrl(workspaceId, contentId, t));
      refresh();
    } catch (e) {
      reportError(e, "pedido ao diretor");
      setMsg(`Não consegui enviar: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ScrollView contentContainerStyle={{ padding: 18, gap: 12, paddingBottom: 40 }} keyboardShouldPersistTaps="handled" testID="director-sheet">
        <View style={[s.row, { justifyContent: "space-between", alignItems: "center" }]}>
          <Text style={{ fontSize: 22, fontWeight: "900", color: colors.ink }}>🎬 Diretor</Text>
          <Button compact variant="ghost" label="Fechar" onPress={onClose} testID="director-close" />
        </View>

        {segments.length ? (
          <Card style={{ gap: 4 }} testID="director-material">
            <Text style={s.label}>{`Material · ${segments.length - missing.length} de ${segments.length}`}</Text>
            {segments.map((sg) => (
              <Text key={sg.index} style={{ color: recorded.includes(sg.index) ? colors.good : colors.muted, fontWeight: "700" }}>
                {`${recorded.includes(sg.index) ? "✅" : "○"} ${sg.label}`}
              </Text>
            ))}
          </Card>
        ) : null}
        <Text style={[s.body, { fontWeight: "800" }]} testID="director-recommendation">{recommendation}</Text>

        {proposal ? (
          <Card style={{ gap: 4 }} testID="director-sheet-proposal">
            <Text style={s.label}>Proposta de montagem</Text>
            <Text style={[s.body, { fontWeight: "700" }]}>{describeEditProposal(proposal.edit)}</Text>
            {proposal.motivo ? <Text style={s.muted}>{`“${proposal.motivo}”`}</Text> : null}
            <Text style={s.muted}>Você aceita ou ajusta ao finalizar o vídeo.</Text>
          </Card>
        ) : null}

        {requests.map((r) => (
          <View key={r.id} style={{ gap: 4 }}>
            <Text style={[s.body, { alignSelf: "flex-end", backgroundColor: colors.line, padding: 8, borderRadius: 12 }]}>{r.texto}</Text>
            <Text style={[s.body, { color: r.resposta ? colors.ink : colors.muted }]} testID="director-answer">
              {r.resposta ? `🎬 ${r.resposta}` : "🎬 aguardando o Diretor…"}
            </Text>
          </View>
        ))}

        <View style={[s.row, { flexWrap: "wrap", gap: 6 }]}>
          {EXAMPLES.map((e) => <Chip key={e} label={e} onPress={() => setText(e)} />)}
        </View>
        <TextInput style={[s.input, { minHeight: 64, textAlignVertical: "top" }]} multiline value={text} onChangeText={setText}
          placeholder="Peça uma alteração ao Diretor…" accessibilityLabel="Pedido ao Diretor" testID="director-input" maxLength={600} />
        <Button label="ENVIAR AO DIRETOR" onPress={() => void send()} loading={sending} disabled={text.trim().length < 2} testID="director-send" />
        {msg ? <Text style={{ color: colors.info, fontWeight: "700" }}>{msg}</Text> : null}
      </ScrollView>
    </Modal>
  );
}

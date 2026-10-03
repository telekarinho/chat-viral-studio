import { Text, View } from "react-native";
import { describeEditProposal } from "@postai/domain";
import type { PendingProposal, ProposalDecision } from "../editProposals";
import { Button, Card, colors, s } from "../ui";

/** Sugestão do diretor (Claude): o criador decide. Nada é montado sem ele tocar em MONTAR ASSIM. */
export function DirectorProposal({ proposal, onDecide }: { proposal: PendingProposal; onDecide: (d: ProposalDecision) => void }) {
  return (
    <Card style={{ gap: 8, borderColor: colors.info, borderWidth: 1 }} testID="director-proposal">
      <Text style={{ color: colors.info, fontWeight: "900" }}>🎬 Seu diretor sugeriu</Text>
      <Text style={[s.body, { fontWeight: "700" }]} testID="director-proposal-text">{describeEditProposal(proposal.edit)}</Text>
      {proposal.motivo ? <Text style={s.muted}>{`“${proposal.motivo}”`}</Text> : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <Button compact label="MONTAR ASSIM" onPress={() => onDecide("montar")} testID="proposal-montar" />
        <Button compact variant="secondary" label="AJUSTAR" onPress={() => onDecide("ajustar")} testID="proposal-ajustar" />
        <Button compact variant="ghost" label="Não, obrigado" onPress={() => onDecide("dispensar")} testID="proposal-dispensar" />
      </View>
    </Card>
  );
}

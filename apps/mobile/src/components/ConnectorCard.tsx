import { useEffect, useState } from "react";
import { Text } from "react-native";
import * as Clipboard from "expo-clipboard";
import { connectorActive, createConnectorLink, revokeConnectorLinks } from "../assistant";
import type { Workspace } from "../db/repo";
import { Button, Card, colors, s } from "../ui";

/** "Conectar meu Claude": link do conector MCP do perfil ativo (o link só aparece na hora de criar). */
export function ConnectorCard({ ws }: { ws: Workspace }) {
  const [state, setState] = useState<{ active: boolean; lastUsedAt: string | null } | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (ws.cloud) void connectorActive(ws.id).then(setState).catch(() => setState(null));
  }, [ws.id, ws.cloud]);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
    } catch (e) {
      setMsg(`Não consegui: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  if (!ws.cloud) return <Card><Text style={s.muted}>O conector precisa da conta na nuvem.</Text></Card>;
  return (
    <Card style={{ gap: 8 }} testID="connector-card">
      <Text style={s.body}>{`Use a sua assinatura do Claude para o Post.ai: ele vê o plano do dia, o desempenho dos posts e escreve o roteiro do perfil “${ws.name}” direto no app.`}</Text>
      <Text style={s.muted}>No Claude: Configurações → Conectores → Adicionar conector personalizado → cole o link. ChatGPT: só nos planos Business/Enterprise.</Text>
      {state?.active && !link ? (
        <Text style={{ color: colors.good, fontWeight: "800" }}>{`Conectado${state.lastUsedAt ? ` · último uso ${new Date(state.lastUsedAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : " · ainda não usado"}`}</Text>
      ) : null}
      {link ? (
        <>
          <Text style={[s.body, { fontSize: 12 }]} selectable testID="connector-link">{link}</Text>
          <Text style={{ color: colors.warn, fontWeight: "700" }}>Guarde só no Claude: quem tiver este link escreve roteiros neste perfil.</Text>
          <Button compact label={copied ? "LINK COPIADO ✓" : "COPIAR LINK"} onPress={async () => { await Clipboard.setStringAsync(link); setCopied(true); }} testID="connector-copy" />
        </>
      ) : (
        <Button compact label={state?.active ? "CRIAR LINK NOVO (o antigo para de funcionar)" : "CONECTAR MEU CLAUDE"} loading={busy}
          onPress={() => void run(async () => { setLink(await createConnectorLink(ws.id)); setCopied(false); setState({ active: true, lastUsedAt: null }); })} testID="connector-create" />
      )}
      {state?.active ? (
        <Button compact variant="ghost" label="DESLIGAR CONECTOR" loading={busy}
          onPress={() => void run(async () => { await revokeConnectorLinks(ws.id); setLink(null); setState({ active: false, lastUsedAt: null }); })} testID="connector-revoke" />
      ) : null}
      {msg ? <Text style={{ color: colors.bad }}>{msg}</Text> : null}
    </Card>
  );
}

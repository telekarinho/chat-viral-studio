import { useEffect, useState } from "react";
import { Text } from "react-native";
import { checkForUpdate, installUpdate, type AvailableUpdate } from "../updater";
import { reportError } from "../telemetry";
import { Button, Card, colors } from "../ui";

/** "Nova versão disponível": one tap downloads and opens the installer — no manual download. */
export function UpdateBanner() {
  const [update, setUpdate] = useState<AvailableUpdate | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    checkForUpdate().then(setUpdate).catch(() => undefined); // offline: just skip
  }, []);

  if (!update) return null;
  return (
    <Card style={{ backgroundColor: "#EAF6EF", gap: 8 }} testID="update-banner">
      <Text style={{ fontWeight: "900", color: colors.good }}>Nova versão do Post.ai disponível</Text>
      <Text style={{ color: colors.inkSoft }}>Seus vídeos e roteiros continuam no celular. Toque, aguarde o download e confirme “Instalar”.</Text>
      {error ? <Text style={{ color: colors.bad }}>{error}</Text> : null}
      <Button
        compact
        label={busy ? "BAIXANDO…" : `ATUALIZAR (${Math.round(update.sizeBytes / 1_048_576)} MB)`}
        loading={busy}
        onPress={async () => {
          setBusy(true);
          setError(null);
          try {
            await installUpdate(update);
          } catch (e) {
            reportError(e, "update");
            setError(e instanceof Error ? e.message : "Não consegui atualizar agora.");
          } finally {
            setBusy(false);
          }
        }}
        testID="update-now"
      />
    </Card>
  );
}

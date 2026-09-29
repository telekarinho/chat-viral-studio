import { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useApp } from "../src/app-state";
import { supabase } from "../src/supabase";
import { reportError } from "../src/telemetry";
import { Button, Card, Empty, ErrorBox, Eyebrow, H1, Loading, Screen, colors, s } from "../src/ui";

interface Clipe {
  clipe: number; titulo: string; duracao_min: number; duracao_max: number; enquadramento: string; instrucao: string; margem_corte?: string;
  status: "pendente" | "em_qa" | "aprovado" | "reprovado"; ultima_rejeicao?: string | null; sugestao_correcao?: string | null;
}
interface Ordem {
  id: number; codigo: string; produto_nome: string; titulo: string | null; objetivo: string | null; prioridade: string | null; status: string;
  detalhe: { clipes?: Clipe[]; checklist?: string[]; evitar?: string[]; texto_falado?: string | null };
}
interface Envio { ordem_id: number; clipe_num: number; status: string; error: string | null; created_at: string }

const OPEN = ["pendente", "em_gravacao", "reprovada"];
const CLIP_LABEL: Record<Clipe["status"], string> = { pendente: "falta gravar", em_qa: "em análise", aprovado: "✓ aprovado", reprovado: "✗ reprovado" };

/** Real footage the MMIX video factory is missing (orders per product and clip). */
export default function Patrimonio() {
  const { workspace } = useApp();
  const [ordens, setOrdens] = useState<Ordem[] | null>(null);
  const [envios, setEnvios] = useState<Envio[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase || !workspace?.cloud) return setOrdens([]);
    try {
      const [o, e] = await Promise.all([
        supabase.from("mmix_gravacao_ordens").select("id,codigo,produto_nome,titulo,objetivo,prioridade,status,detalhe").eq("workspace_id", workspace.id).in("status", OPEN),
        supabase.from("patrimonio_envios").select("ordem_id,clipe_num,status,error,created_at").eq("workspace_id", workspace.id).order("created_at", { ascending: false }).limit(200),
      ]);
      if (o.error ?? e.error) throw o.error ?? e.error;
      setOrdens((o.data ?? []) as Ordem[]);
      setEnvios((e.data ?? []) as Envio[]);
      setError(null);
    } catch (err) {
      reportError(err, "patrimonio load");
      setError("Não consegui buscar a lista da fábrica. Precisa de internet.");
    }
  }, [workspace]);
  useFocusEffect(useCallback(() => void load(), [load]));

  if (!ordens && !error) return <Screen><Loading label="Buscando o que a fábrica precisa…" /></Screen>;
  const lastEnvio = (o: number, c: number) => envios.find((e) => e.ordem_id === o && e.clipe_num === c);

  return (
    <Screen testID="patrimonio-screen">
      <Eyebrow>Fábrica de vídeos MMIX</Eyebrow>
      <H1>Gravar patrimônio</H1>
      <Text style={s.muted}>Filmagens reais que a fábrica não tem e estão travando vídeos. Grave, assista, e se ficou bom envie: a fábrica confere (9:16, resolução, duração, tela preta) e guarda no patrimônio.</Text>
      {error ? <ErrorBox message={error} onRetry={load} /> : null}
      {ordens?.length === 0 ? (
        <Empty title="Nada pendente para este perfil" body="Esta lista aparece no perfil da empresa ligado à fábrica MMIX, e é atualizada a cada 5 minutos." />
      ) : null}
      {ordens?.map((o) => {
        const clipes = o.detalhe.clipes ?? [];
        const done = clipes.filter((c) => c.status === "aprovado").length;
        return (
          <Card key={o.id} style={{ gap: 8 }} testID={`ordem-${o.id}`}>
            <Text style={s.label}>{`${o.codigo} · ${o.prioridade ?? ""} · ${done}/${clipes.length} clipes`}</Text>
            <Text style={{ fontSize: 18, fontWeight: "800", color: colors.ink }}>{o.produto_nome}</Text>
            {o.titulo ? <Text style={s.body}>{o.titulo}</Text> : null}
            {o.objetivo ? <Text style={s.muted}>{o.objetivo}</Text> : null}
            <Button variant="secondary" compact label={open === o.id ? "FECHAR" : "VER CLIPES"} onPress={() => setOpen(open === o.id ? null : o.id)} />
            {open === o.id ? (
              <View style={{ gap: 10 }}>
                {o.detalhe.checklist?.length ? <Text style={s.muted}>{`Checklist: ${o.detalhe.checklist.join(" · ")}`}</Text> : null}
                {o.detalhe.evitar?.length ? <Text style={s.muted}>{`Evite: ${o.detalhe.evitar.join(" · ")}`}</Text> : null}
                {clipes.map((c) => {
                  const env = lastEnvio(o.id, c.clipe);
                  const queued = env && (env.status === "queued" || env.status === "sending");
                  return (
                    <Card key={c.clipe} style={{ gap: 6 }}>
                      <Text style={s.label}>{`Clipe ${c.clipe} · ${c.enquadramento} · ${Math.round(c.duracao_min)}–${Math.round(c.duracao_max)}s · ${queued ? "enviando…" : CLIP_LABEL[c.status] ?? c.status}`}</Text>
                      <Text style={{ fontWeight: "700", color: colors.ink }}>{c.titulo}</Text>
                      <Text style={s.body}>{c.instrucao}</Text>
                      {c.status === "reprovado" && c.ultima_rejeicao ? <Text style={{ color: colors.bad }}>{`Reprovado: ${c.ultima_rejeicao}${c.sugestao_correcao ? ` — ${c.sugestao_correcao}` : ""}`}</Text> : null}
                      {env?.status === "failed" && env.error ? <Text style={{ color: colors.bad }}>{`Falha no envio: ${env.error}`}</Text> : null}
                      {c.status !== "aprovado" && !queued ? (
                        <Button compact label={c.status === "reprovado" ? "GRAVAR DE NOVO" : "GRAVAR ESTE CLIPE"} testID={`gravar-${o.id}-${c.clipe}`}
                          onPress={() => router.push({ pathname: "/record", params: { ordem: String(o.id), clipe: String(c.clipe),
                            instrucao: `${c.titulo}\n\n${c.instrucao}\n\n${c.enquadramento} · ${Math.round(c.duracao_min)}–${Math.round(c.duracao_max)}s${c.margem_corte ? `\n${c.margem_corte}` : ""}` } })} />
                      ) : null}
                    </Card>
                  );
                })}
              </View>
            ) : null}
          </Card>
        );
      })}
    </Screen>
  );
}

import { useCallback, useState } from "react";
import { Text, TextInput, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { initialCourse, lessonPublishBlockers, type CourseLesson, type LessonStatus } from "@postai/domain";
import { useApp } from "../src/app-state";
import { newId } from "../src/config";
import { supabase } from "../src/supabase";
import { reportError } from "../src/telemetry";
import { Button, Card, Chip, Empty, ErrorBox, Eyebrow, H1, Loading, Screen, colors, s } from "../src/ui";

type Row = { id: string; modulo: string; ordem: number; titulo: string; objetivo: string; prerequisitos: string; ingredientes: CourseLesson["ingredientes"]; sku: string | null;
  fonte_sorvete: CourseLesson["fonteSorvete"]; content_item_id: string | null; status: LessonStatus; versao: number };
const toLesson = (r: Row): CourseLesson => ({ id: r.id, modulo: r.modulo, ordem: r.ordem, titulo: r.titulo, objetivo: r.objetivo, prerequisitos: r.prerequisitos,
  ingredientes: r.ingredientes ?? [], sku: r.sku, fonteSorvete: r.fonte_sorvete, contentItemId: r.content_item_id, status: r.status, versao: r.versao });
const STATUS_LABEL: Record<LessonStatus, string> = { rascunho: "rascunho", gravando: "gravando", revisao_tecnica: "em revisão técnica", aprovada: "✓ aprovada", publicada: "publicada no curso" };
const NEXT: Partial<Record<LessonStatus, { to: LessonStatus; label: string }>> = {
  gravando: { to: "revisao_tecnica", label: "ENVIAR PARA REVISÃO TÉCNICA" },
  revisao_tecnica: { to: "aprovada", label: "APROVAR (RODRIGO)" },
};

/** Curso de Milk Shake Profissional ControlPot — estrutura editável; matrícula/acesso ficam na área do cliente MMIX. */
export default function Curso() {
  const { workspace } = useApp();
  const [aulas, setAulas] = useState<CourseLesson[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ objetivo: string; ingredientes: string }>({ objetivo: "", ingredientes: "" });
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase || !workspace?.cloud) return setAulas([]);
    const { data, error: e } = await supabase.from("course_lessons").select("*").eq("workspace_id", workspace.id).order("ordem");
    if (e) return setError(e.message);
    setAulas(((data ?? []) as Row[]).map(toLesson));
  }, [workspace]);
  useFocusEffect(useCallback(() => void load(), [load]));

  async function act(fn: () => PromiseLike<{ error: { message: string } | null }>) {
    try {
      const { error: e } = await fn();
      if (e) throw new Error(e.message);
      await load();
    } catch (e) {
      reportError(e, "curso");
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (!aulas) return <Screen><Loading /></Screen>;
  const db = supabase!;
  return (
    <Screen testID="curso-screen">
      <Button variant="ghost" compact label="← Voltar" onPress={() => router.back()} />
      <Eyebrow>Estúdio da fábrica</Eyebrow>
      <H1>Curso de Milk Shake</H1>
      <Text style={s.muted}>Estrutura para você aprovar. Quantidade de aulas, receita, medidas, tempo de batida e preço NÃO são fixados pelo app: vêm da gravação e da sua aprovação.</Text>
      {error ? <ErrorBox message={error} /> : null}
      {!workspace?.cloud ? <Empty title="O curso precisa da conta na nuvem" /> : null}
      {workspace?.cloud && aulas.length === 0 ? (
        <Card style={{ gap: 8 }}>
          <Text style={s.body}>Criar a estrutura inicial com os 13 módulos (editável).</Text>
          <Button label="CRIAR ESTRUTURA DO CURSO" onPress={() => void act(() => db.from("course_lessons").insert(initialCourse(newId).map((l) => ({
            id: l.id, workspace_id: workspace.id, modulo: l.modulo, ordem: l.ordem, titulo: l.titulo, objetivo: l.objetivo, prerequisitos: l.prerequisitos, fonte_sorvete: l.fonteSorvete,
          }))))} testID="curso-criar" />
        </Card>
      ) : null}
      {aulas.map((l) => {
        const blockers = lessonPublishBlockers(l, Boolean(l.contentItemId));
        const next = NEXT[l.status];
        return (
          <Card key={l.id} style={{ gap: 6 }}>
            <Text style={s.label}>{`Módulo ${l.ordem} · ${STATUS_LABEL[l.status]} · v${l.versao}${l.fonteSorvete === "balde" ? " · 🪣 balde" : ""}`}</Text>
            <Text style={{ fontSize: 17, fontWeight: "800", color: colors.ink }}>{l.titulo}</Text>
            <Text style={s.muted}>{l.objetivo}</Text>
            <View style={s.row}>
              <Chip label={open === l.id ? "fechar" : "editar"} onPress={() => { setOpen(open === l.id ? null : l.id); setDraft({ objetivo: l.objetivo, ingredientes: l.ingredientes.map((i) => `${i.item} | ${i.quantidade}`).join("\n") }); }} />
              {l.contentItemId ? <Chip label="abrir gravação" onPress={() => router.push(`/content/${l.contentItemId}`)} /> : null}
            </View>
            {open === l.id ? (
              <View style={{ gap: 6 }}>
                <TextInput style={s.input} value={draft.objetivo} onChangeText={(v) => setDraft({ ...draft, objetivo: v })} accessibilityLabel="Objetivo da aula" />
                <TextInput style={[s.input, { minHeight: 80, textAlignVertical: "top" }]} multiline value={draft.ingredientes} onChangeText={(v) => setDraft({ ...draft, ingredientes: v })}
                  placeholder="ingrediente | quantidade aprovada (um por linha)" accessibilityLabel="Ingredientes" />
                <Button compact label="SALVAR (nova versão)" onPress={() => void act(() => db.from("course_lessons").update({
                  objetivo: draft.objetivo.trim(), versao: l.versao + 1, updated_at: new Date().toISOString(),
                  status: l.status === "aprovada" ? "revisao_tecnica" : l.status, // changing an approved lesson needs review again
                  ingredientes: draft.ingredientes.split("\n").map((x) => x.trim()).filter(Boolean).map((x) => { const [item, ...q] = x.split("|"); return { item: item!.trim(), quantidade: q.join("|").trim() }; }),
                }).eq("id", l.id))} />
              </View>
            ) : null}
            {!l.contentItemId ? (
              <Button compact label="GRAVAR ESTA AULA" onPress={() => void act(async () => {
                const r = await db.from("course_lessons").update({ status: "gravando", updated_at: new Date().toISOString() }).eq("id", l.id);
                router.push({ pathname: "/projeto", params: { mode: "aula", aulaId: l.id, aulaTitulo: l.titulo } });
                return r;
              })} />
            ) : null}
            {next ? <Button compact variant="secondary" label={next.label} onPress={() => void act(() => db.from("course_lessons").update({ status: next.to, updated_at: new Date().toISOString() }).eq("id", l.id))} /> : null}
            {l.status === "aprovada" && blockers.length === 0 ? <Text style={s.muted}>Pronta para o curso. A publicação e o acesso do aluno acontecem na área do cliente MMIX (A VALIDAR).</Text> : null}
            {l.status !== "rascunho" && blockers.length ? <Text style={{ color: colors.warn }}>{blockers.join(" · ")}</Text> : null}
          </Card>
        );
      })}
    </Screen>
  );
}

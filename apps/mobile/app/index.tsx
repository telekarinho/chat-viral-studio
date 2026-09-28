import { ScrollView, StyleSheet, Text, View, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const tasks = [
  { time: "08:45", title: "Café da manhã", meta: "B-roll · 3s", state: "done" },
  { time: "10:30", title: "Pensamento do Dia", meta: "9s · Reflexão", state: "ready" },
  { time: "17:30", title: "Saída do trabalho", meta: "B-roll · 3s", state: "pending" },
  { time: "19:30", title: "Vídeo principal", meta: "Transformação pessoal · 60s", state: "pending" },
  { time: "20:15", title: "Academia", meta: "B-roll · exercício / entrada / final", state: "pending" }
];

export default function TodayScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.eyebrow}>POST.AI · BETA</Text>
        <Text style={styles.h1}>Hoje</Text>
        <Text style={styles.date}>SEGUNDA · 28/09</Text>

        <View style={styles.hero}>
          <Text style={styles.heroLabel}>AGORA</Text>
          <Text style={styles.heroTitle}>Pensamento do Dia</Text>
          <Text style={styles.script}>
            “Talvez você não precise mudar sua vida inteira hoje. Talvez só precise fazer hoje uma coisa que o seu futuro vai agradecer.”
          </Text>
          <Pressable style={styles.primary}><Text style={styles.primaryText}>GRAVAR AGORA</Text></Pressable>
        </View>

        <View style={styles.progressCard}>
          <View>
            <Text style={styles.cardLabel}>PROGRESSO DO DIA</Text>
            <Text style={styles.progress}>1 de 5 cenas captadas</Text>
          </View>
          <Text style={styles.progressPct}>20%</Text>
        </View>

        <Text style={styles.section}>MISSÕES DE CAPTAÇÃO</Text>
        {tasks.map((task) => (
          <View key={task.time + task.title} style={styles.task}>
            <View style={styles.timeCol}><Text style={styles.time}>{task.time}</Text></View>
            <View style={styles.taskBody}>
              <Text style={styles.taskTitle}>{task.title}</Text>
              <Text style={styles.meta}>{task.meta}</Text>
              {task.title === "Vídeo principal" && (
                <View style={styles.actions}>
                  <Pressable style={styles.secondary}><Text>VER ROTEIRO</Text></Pressable>
                  <Pressable style={styles.secondary}><Text>TELEPROMPTER</Text></Pressable>
                </View>
              )}
            </View>
            <View style={[styles.dot, task.state === "done" && styles.dotDone, task.state === "ready" && styles.dotReady]} />
          </View>
        ))}

        <View style={styles.contents}>
          <Text style={styles.section}>CONTEÚDOS</Text>
          <Text style={styles.contentLine}>Pensamento <Text style={styles.ok}>PRONTO PARA GRAVAR</Text></Text>
          <Text style={styles.contentLine}>Vídeo principal <Text style={styles.wait}>PENDENTE</Text></Text>
          <Text style={styles.contentLine}>Stories <Text style={styles.info}>2 sugestões</Text></Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F7F8FA" },
  container: { padding: 20, paddingBottom: 40, gap: 14 },
  eyebrow: { fontSize: 12, letterSpacing: 1.5, fontWeight: "700", color: "#6B7280" },
  h1: { fontSize: 36, fontWeight: "800", color: "#111827" },
  date: { fontSize: 13, fontWeight: "700", color: "#6B7280", marginTop: -8 },
  hero: { backgroundColor: "#111827", borderRadius: 24, padding: 22, gap: 12 },
  heroLabel: { color: "#A7F3D0", fontSize: 12, fontWeight: "800", letterSpacing: 1.3 },
  heroTitle: { color: "white", fontSize: 24, fontWeight: "800" },
  script: { color: "#E5E7EB", fontSize: 17, lineHeight: 25 },
  primary: { backgroundColor: "white", paddingVertical: 15, borderRadius: 14, alignItems: "center", marginTop: 4 },
  primaryText: { fontWeight: "900", color: "#111827" },
  progressCard: { backgroundColor: "white", borderRadius: 18, padding: 18, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardLabel: { fontSize: 11, fontWeight: "800", color: "#6B7280" },
  progress: { fontSize: 17, fontWeight: "700", color: "#111827", marginTop: 3 },
  progressPct: { fontSize: 24, fontWeight: "900", color: "#111827" },
  section: { fontSize: 12, fontWeight: "900", letterSpacing: 1.1, color: "#6B7280", marginTop: 8 },
  task: { backgroundColor: "white", borderRadius: 18, padding: 16, flexDirection: "row", gap: 12, alignItems: "flex-start" },
  timeCol: { width: 46 },
  time: { fontSize: 14, fontWeight: "800", color: "#111827" },
  taskBody: { flex: 1, gap: 3 },
  taskTitle: { fontSize: 17, fontWeight: "800", color: "#111827" },
  meta: { fontSize: 13, color: "#6B7280" },
  dot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: "#D1D5DB", marginTop: 4 },
  dotDone: { backgroundColor: "#10B981", borderColor: "#10B981" },
  dotReady: { backgroundColor: "#F59E0B", borderColor: "#F59E0B" },
  actions: { flexDirection: "row", gap: 8, marginTop: 10, flexWrap: "wrap" },
  secondary: { borderWidth: 1, borderColor: "#E5E7EB", paddingHorizontal: 11, paddingVertical: 9, borderRadius: 10 },
  contents: { gap: 10 },
  contentLine: { backgroundColor: "white", borderRadius: 14, padding: 15, fontSize: 15, fontWeight: "700", color: "#111827" },
  ok: { color: "#059669", fontSize: 11 },
  wait: { color: "#B45309", fontSize: 11 },
  info: { color: "#2563EB", fontSize: 11 }
});

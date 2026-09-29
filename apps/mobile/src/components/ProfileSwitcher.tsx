import { useEffect, useState } from "react";
import { ScrollView } from "react-native";
import { router } from "expo-router";
import { activateWorkspace, listWorkspaces, type Workspace } from "../db/repo";
import { useApp } from "../app-state";
import { reportError } from "../telemetry";
import { Chip } from "../ui";

/** Which profile am I recording for now (personal, company, product...). */
export function ProfileSwitcher() {
  const { workspace, reload } = useApp();
  const [all, setAll] = useState<Workspace[]>([]);
  useEffect(() => void listWorkspaces().then(setAll).catch((e) => reportError(e, "list profiles")), [workspace?.id]);

  async function pick(id: string) {
    if (id === workspace?.id) return;
    await activateWorkspace(id);
    await reload();
  }

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }} testID="profile-switcher">
      {all.map((w) => (
        <Chip key={w.id} label={`${w.profile.kind === "empresa" ? "🏭" : "🙂"} ${w.name}`} selected={w.id === workspace?.id} onPress={() => void pick(w.id)} testID={`profile-${w.id}`} />
      ))}
      <Chip label="+ Perfil" onPress={() => router.push("/perfis")} testID="profile-add" />
    </ScrollView>
  );
}

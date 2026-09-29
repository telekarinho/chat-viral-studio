import { useState } from "react";
import { Text, TextInput } from "react-native";
import { router } from "expo-router";
import { supabase } from "../src/supabase";
import { useApp } from "../src/app-state";
import { findRemoteWorkspaces, pullAllWorkspaces } from "../src/workspace-setup";
import { Button, Card, ErrorBox, Eyebrow, H1, Screen, s } from "../src/ui";

export default function Login() {
  const { reload } = useApp();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function submit() {
    if (!supabase) return;
    setError(null);
    setInfo(null);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError("Digite um e-mail válido.");
    if (password.length < 8) return setError("A senha precisa ter pelo menos 8 caracteres.");
    setBusy(true);
    try {
      const creds = { email: email.trim().toLowerCase(), password };
      const res = mode === "signin" ? await supabase.auth.signInWithPassword(creds) : await supabase.auth.signUp(creds);
      if (res.error) throw res.error;
      if (!res.data.session) {
        setInfo("Conta criada. Confirme o e-mail que enviamos e depois entre.");
        setMode("signin");
        return;
      }
      const ids = await findRemoteWorkspaces();
      if (ids.length) await pullAllWorkspaces(ids);
      await reload();
      router.replace(ids.length ? "/" : "/onboarding");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(/invalid login/i.test(msg) ? "E-mail ou senha incorretos." : /network|fetch/i.test(msg) ? "Sem internet. O login precisa de conexão só na primeira vez." : msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen testID="login-screen">
      <Eyebrow>Post.ai · beta</Eyebrow>
      <H1>{mode === "signin" ? "Entrar" : "Criar conta"}</H1>
      <Text style={s.muted}>Seu roteiro, sua câmera e seus takes. Depois do primeiro login, a gravação funciona sem internet.</Text>
      <Card style={{ gap: 12 }}>
        <Text style={s.label}>E-mail</Text>
        <TextInput testID="login-email" style={s.input} autoCapitalize="none" keyboardType="email-address" autoComplete="email" value={email} onChangeText={setEmail} accessibilityLabel="E-mail" />
        <Text style={s.label}>Senha</Text>
        <TextInput testID="login-password" style={s.input} secureTextEntry autoComplete="password" value={password} onChangeText={setPassword} accessibilityLabel="Senha" />
        <Button testID="login-submit" label={mode === "signin" ? "ENTRAR" : "CRIAR CONTA"} onPress={submit} loading={busy} />
        <Button variant="ghost" label={mode === "signin" ? "Não tenho conta — criar" : "Já tenho conta — entrar"} onPress={() => setMode(mode === "signin" ? "signup" : "signin")} />
      </Card>
      {info ? <Card><Text style={s.body}>{info}</Text></Card> : null}
      {error ? <ErrorBox message={error} /> : null}
    </Screen>
  );
}

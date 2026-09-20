import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useAccounts } from "../lib/account-manager";
import { api } from "../lib/auth";
import { queryClient, keys } from "../lib/query";
import { Glass } from "../ui/Glass";
import { Wallpaper } from "../ui/Wallpaper";
import { colors, radii, space } from "../ui/theme";

export function CreateWorkspaceScreen({ onCreated }: { onCreated: () => void }) {
  const { removeAccount, startAddAccount } = useAccounts();
  const [name, setName] = useState("");
  const [invite, setInvite] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      await api("/api/workspaces", { method: "POST", body: JSON.stringify({ name: name.trim() }) });
      await queryClient.invalidateQueries({ queryKey: keys.me });
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      await api("/api/invites/accept", { method: "POST", body: JSON.stringify({ token: invite.trim() }) });
      await queryClient.invalidateQueries({ queryKey: keys.me });
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.root}>
      <Wallpaper />
      <StatusBar style="light" />
      <View style={styles.center}>
        <Glass style={styles.card}>
          <Text style={styles.h1}>Create a workspace</Text>
          <Text style={styles.sub}>You’re signed in. Name your team, or paste an invite token.</Text>
          {error ? <Text style={styles.err}>{error}</Text> : null}
          <TextInput
            style={styles.input}
            placeholder="Workspace name"
            placeholderTextColor={colors.faint}
            value={name}
            onChangeText={setName}
          />
          <Pressable style={styles.cta} onPress={() => void create()} disabled={busy || !name.trim()}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.ctaTxt}>Create workspace</Text>}
          </Pressable>
          <Text style={styles.or}>or join with invite</Text>
          <TextInput
            style={styles.input}
            placeholder="Invite token"
            placeholderTextColor={colors.faint}
            value={invite}
            onChangeText={setInvite}
            autoCapitalize="none"
          />
          <Pressable style={styles.alt} onPress={() => void accept()} disabled={busy || !invite.trim()}>
            <Text style={styles.altTxt}>Accept invite</Text>
          </Pressable>
          <Pressable onPress={() => startAddAccount()}>
            <Text style={styles.out}>Sign in with another account</Text>
          </Pressable>
          <Pressable onPress={() => void removeAccount()}>
            <Text style={styles.out}>Sign out</Text>
          </Pressable>
        </Glass>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, justifyContent: "center", padding: 22 },
  card: { padding: space.lg, borderRadius: radii.lg, gap: 10 },
  h1: { color: colors.ink, fontSize: 28, fontWeight: "800" },
  sub: { color: colors.muted, marginBottom: 4 },
  err: { color: colors.pink },
  input: {
    height: 48,
    borderRadius: radii.sm,
    paddingHorizontal: 12,
    color: colors.ink,
    backgroundColor: "rgba(0,0,0,0.22)",
    fontSize: 16,
  },
  cta: {
    height: 48,
    borderRadius: radii.sm,
    backgroundColor: colors.green,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaTxt: { color: "#fff", fontWeight: "800", fontSize: 16 },
  or: { color: colors.faint, textAlign: "center", fontWeight: "600" },
  alt: {
    height: 48,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.hairline,
    alignItems: "center",
    justifyContent: "center",
  },
  altTxt: { color: colors.ink, fontWeight: "800" },
  out: { color: colors.muted, textAlign: "center", marginTop: 8 },
});

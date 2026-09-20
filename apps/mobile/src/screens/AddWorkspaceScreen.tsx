import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAccounts } from "../lib/account-manager";
import { api } from "../lib/auth";
import { keys, queryClient, setActiveWorkspaceId } from "../lib/query";
import { Glass } from "../ui/Glass";
import { HeaderBtn, ScreenHeader } from "../ui/Header";
import { colors, radii, space } from "../ui/theme";
import type { RootStackParamList } from "../nav/types";

type Props = NativeStackScreenProps<RootStackParamList, "AddWorkspace">;

export function AddWorkspaceScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { startAddAccount } = useAccounts();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const created = await api<{ workspace: { id: string } }>("/api/workspaces", {
        method: "POST",
        body: JSON.stringify({ name: name.trim() }),
      });
      await api(`/api/workspaces/${created.workspace.id}/select`, { method: "POST" });
      setActiveWorkspaceId(created.workspace.id);
      await queryClient.invalidateQueries({ queryKey: keys.me });
      navigation.goBack();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <Glass style={styles.head}>
        <ScreenHeader
          title={creating ? "Create workspace" : "Add a workspace"}
          left={<HeaderBtn label="‹" onPress={() => (creating ? setCreating(false) : navigation.goBack())} />}
        />
      </Glass>
      <View style={{ padding: space.md, gap: 12 }}>
        {creating ? (
          <Glass style={styles.card}>
            {error ? <Text style={styles.err}>{error}</Text> : null}
            <TextInput
              style={styles.input}
              placeholder="Workspace name"
              placeholderTextColor={colors.faint}
              value={name}
              onChangeText={setName}
            />
            <Pressable style={styles.cta} disabled={busy || !name.trim()} onPress={() => void create()}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.ctaTxt}>Create</Text>}
            </Pressable>
          </Glass>
        ) : (
          <>
            <Pressable onPress={() => setCreating(true)}>
              <Glass style={styles.card}>
                <Text style={styles.title}>Create with this account</Text>
                <Text style={styles.sub}>Stay signed in and make another workspace.</Text>
              </Glass>
            </Pressable>
            <Pressable onPress={() => startAddAccount()}>
              <Glass style={styles.card}>
                <Text style={styles.title}>Sign in with another account</Text>
                <Text style={styles.sub}>Add a different email. Both accounts stay on this device.</Text>
              </Glass>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  head: { marginHorizontal: 12, marginBottom: 8, borderRadius: radii.lg },
  card: { padding: 16, borderRadius: radii.lg, gap: 10 },
  title: { color: colors.ink, fontSize: 18, fontWeight: "800" },
  sub: { color: colors.muted, marginTop: 4 },
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
});

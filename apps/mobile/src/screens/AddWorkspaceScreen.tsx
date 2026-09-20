import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useAccounts } from "../lib/account-manager";
import { api } from "../lib/auth";
import { keys, queryClient, setActiveWorkspaceId } from "../lib/query";
import { useWorkspace } from "../lib/workspace";
import { HeaderBtn } from "../ui/Header";
import { PageHeader, ScreenCanvas } from "../ui/SlackChrome";
import { colors, radii, space } from "../ui/theme";
import type { RootStackParamList } from "../nav/types";

type Props = NativeStackScreenProps<RootStackParamList, "AddWorkspace">;
type Panel = "choose" | "find" | "create";

export function AddWorkspaceScreen({ navigation }: Props) {
  const { startAddAccount } = useAccounts();
  const { workspaces, workspace, selectWorkspace } = useWorkspace();
  const [view, setView] = useState<Panel>("choose");
  const [name, setName] = useState("");
  const [invite, setInvite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title = view === "find" ? "Find workspaces" : view === "create" ? "Create a new workspace" : "Add a workspace";

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

  async function join() {
    setBusy(true);
    setError(null);
    try {
      const raw = invite.trim();
      const token = raw.includes("invite=") ? (raw.split("invite=")[1]?.split("&")[0] ?? raw) : raw;
      const res = await api<{ workspace: { id: string } }>("/api/invites/accept", {
        method: "POST",
        body: JSON.stringify({ token }),
      });
      if (res.workspace?.id) {
        await selectWorkspace(res.workspace.id);
      }
      navigation.goBack();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScreenCanvas>
      <PageHeader
        title={title}
        left={
          <HeaderBtn
            label="‹"
            onPress={() => (view === "choose" ? navigation.goBack() : setView("choose"))}
          />
        }
      />
      <View style={{ padding: space.md, gap: 8 }}>
        {error ? <Text style={styles.err}>{error}</Text> : null}
        {view === "choose" ? (
          <>
            <Row icon="👤+" label="Sign in to another workspace" onPress={() => startAddAccount()} />
            <Row icon="⌕" label="Find workspaces" onPress={() => setView("find")} />
            <Row icon="+" label="Create a new workspace" onPress={() => setView("create")} />
          </>
        ) : view === "create" ? (
          <View style={styles.card}>
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
          </View>
        ) : (
          <>
            {workspaces.map((ws) => (
              <Pressable
                key={ws.id}
                disabled={ws.id === workspace.id}
                onPress={() => {
                  void selectWorkspace(ws.id).then(() => navigation.goBack());
                }}
              >
                <View style={styles.row}>
                  <View style={styles.ico}>
                    <Text style={styles.icoTxt}>{(ws.iconLetter || ws.name[0] || "W").toUpperCase()}</Text>
                  </View>
                  <Text style={styles.rowTxt}>
                    {ws.name}
                    {ws.id === workspace.id ? " · current" : ""}
                  </Text>
                </View>
              </Pressable>
            ))}
            <View style={styles.card}>
              <TextInput
                style={styles.input}
                placeholder="Paste invite link"
                placeholderTextColor={colors.faint}
                value={invite}
                onChangeText={setInvite}
                autoCapitalize="none"
              />
              <Pressable style={styles.cta} disabled={busy || !invite.trim()} onPress={() => void join()}>
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.ctaTxt}>Join workspace</Text>}
              </Pressable>
            </View>
          </>
        )}
      </View>
    </ScreenCanvas>
  );
}

function Row({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress}>
      <View style={styles.row}>
        <View style={styles.ico}>
          <Text style={styles.icoTxt}>{icon}</Text>
        </View>
        <Text style={styles.rowTxt}>{label}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16, borderRadius: radii.lg, gap: 10, borderWidth: 1, borderColor: colors.hairline },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  ico: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: colors.inputFill,
    alignItems: "center",
    justifyContent: "center",
  },
  icoTxt: { color: colors.ink, fontWeight: "700", fontSize: 16 },
  rowTxt: { color: colors.ink, fontSize: 16, fontWeight: "600", flex: 1 },
  err: { color: colors.pink },
  input: {
    height: 48,
    borderRadius: radii.sm,
    paddingHorizontal: 12,
    color: colors.ink,
    backgroundColor: colors.inputFill,
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

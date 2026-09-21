import { useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { InboxInvite } from "@relay/shared";
import { useAccounts } from "../lib/account-manager";
import { api } from "../lib/auth";
import { keys, queryClient, setActiveWorkspaceId, type MeResponse } from "../lib/query";
import { useWorkspace } from "../lib/workspace";
import { WorkspaceGlyph } from "../ui/Glyph";
import { PageHeader, ScreenCanvas } from "../ui/SlackChrome";
import { colors, radii } from "../ui/theme";
import type { RootStackParamList } from "../nav/types";

type Props = NativeStackScreenProps<RootStackParamList, "AddWorkspace">;
type Panel = "choose" | "find" | "create";

export function AddWorkspaceScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { startAddAccount } = useAccounts();
  const { me, selectWorkspace } = useWorkspace();
  const meQ = useQuery({
    queryKey: keys.me,
    queryFn: () => api<MeResponse>("/api/me"),
  });
  const pendingInvites = meQ.data?.pendingInvites ?? [];
  const [view, setView] = useState<Panel>("choose");
  const [name, setName] = useState("");
  const [invite, setInvite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title =
    view === "find" ? "Join another workspace" : view === "create" ? "Create a new workspace" : "Add workspaces";

  function closeOrBack() {
    if (view === "choose") {
      navigation.goBack();
      return;
    }
    setError(null);
    setView("choose");
  }

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

  async function joinInbox(item: InboxInvite) {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ workspace: { id: string } }>("/api/invites/accept", {
        method: "POST",
        body: JSON.stringify({ inviteId: item.id }),
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
        sheet
        back={view === "choose" ? "close" : "back"}
        onBack={closeOrBack}
      />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]}
        >
          {error ? <Text style={styles.err}>{error}</Text> : null}
          {view === "choose" ? (
            <>
              <View style={styles.emailRow}>
                <View style={styles.slot}>
                  <Ionicons name="mail-outline" size={22} color={colors.ink} />
                </View>
                <Text style={styles.email} numberOfLines={1}>
                  {me.email}
                </Text>
                <Pressable
                  hitSlop={10}
                  accessibilityLabel="About this email"
                  onPress={() =>
                    Alert.alert(
                      me.email,
                      "You're signed in to every workspace on this email. Sign in with a different account, join with an invite, or create a new workspace.",
                    )
                  }
                >
                  <Ionicons name="information-circle" size={22} color={colors.accent} />
                </Pressable>
              </View>

              <View style={styles.signedRow}>
                <View style={styles.slot} />
                <View style={styles.check}>
                  <Ionicons name="checkmark" size={16} color="#8E8E93" />
                </View>
                <Text style={styles.signed}>You're signed in to all workspaces for this email</Text>
              </View>

              <View style={styles.divider} />

              <Text style={styles.section}>Not the workspaces you're looking for?</Text>

              <Action
                icon={<GridIcon />}
                label="Sign in to another workspace"
                onPress={() => startAddAccount()}
              />
              <Action
                icon={<Ionicons name="person-add-outline" size={22} color={colors.ink} />}
                label="Join another workspace"
                onPress={() => {
                  setError(null);
                  setView("find");
                }}
              />
              <Action
                icon={<Ionicons name="add" size={26} color={colors.ink} />}
                label="Create a new workspace"
                onPress={() => {
                  setError(null);
                  setView("create");
                }}
              />
            </>
          ) : view === "create" ? (
            <View style={styles.form}>
              <TextInput
                style={styles.input}
                placeholder="Workspace name"
                placeholderTextColor={colors.faint}
                value={name}
                onChangeText={setName}
                autoFocus
              />
              <Pressable style={styles.cta} disabled={busy || !name.trim()} onPress={() => void create()}>
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.ctaTxt}>Create</Text>}
              </Pressable>
            </View>
          ) : (
            <View style={styles.form}>
              {pendingInvites.map((item) => (
                <View key={item.id} style={styles.invite}>
                  <WorkspaceGlyph workspace={item.workspace} size={36} />
                  <View style={styles.flex}>
                    <Text style={styles.inviteName}>{item.workspace.name}</Text>
                    <Text style={styles.meta}>
                      {item.invitedByName ? `Invited by ${item.invitedByName}` : "Pending invite"}
                    </Text>
                  </View>
                  <Pressable style={styles.smallCta} disabled={busy} onPress={() => void joinInbox(item)}>
                    <Text style={styles.ctaTxt}>Accept</Text>
                  </Pressable>
                </View>
              ))}
              <TextInput
                style={styles.input}
                placeholder="Paste invite link"
                placeholderTextColor={colors.faint}
                value={invite}
                onChangeText={setInvite}
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus={pendingInvites.length === 0}
              />
              <Pressable style={styles.cta} disabled={busy || !invite.trim()} onPress={() => void join()}>
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.ctaTxt}>Join workspace</Text>}
              </Pressable>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenCanvas>
  );
}

function Action({ icon, label, onPress }: { icon: ReactNode; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
      <View style={styles.slot}>{icon}</View>
      <Text style={styles.actionTxt}>{label}</Text>
    </Pressable>
  );
}

function GridIcon() {
  return (
    <View style={styles.grid}>
      {[0, 1, 2, 3].map((cell) => (
        <View key={cell} style={styles.gridCell} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: {
    paddingHorizontal: 16,
    paddingTop: 18,
  },
  emailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 36,
  },
  slot: {
    width: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  email: {
    flex: 1,
    color: colors.ink,
    fontSize: 17,
  },
  signedRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginTop: 16,
  },
  check: {
    width: 28,
    height: 28,
    borderRadius: 7,
    backgroundColor: "#E8E8ED",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  signed: {
    flex: 1,
    color: "#616061",
    fontSize: 16,
    lineHeight: 22,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#E6E6E6",
    marginTop: 18,
  },
  section: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: "700",
    marginTop: 18,
    marginBottom: 6,
  },
  action: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 13,
  },
  actionTxt: {
    flex: 1,
    color: colors.ink,
    fontSize: 17,
  },
  pressed: { opacity: 0.55 },
  grid: {
    width: 22,
    height: 22,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 3,
  },
  gridCell: {
    width: 9,
    height: 9,
    borderRadius: 2,
    borderWidth: 1.5,
    borderColor: colors.ink,
  },
  err: { color: colors.pink, marginBottom: 12 },
  form: { gap: 12, paddingTop: 8 },
  invite: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
  },
  inviteName: { color: colors.ink, fontSize: 16, fontWeight: "600" },
  meta: { color: colors.muted, fontSize: 13, marginTop: 2 },
  input: {
    height: 48,
    borderRadius: radii.sm,
    paddingHorizontal: 12,
    color: colors.ink,
    backgroundColor: colors.inputFill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E6E6E6",
    fontSize: 16,
  },
  cta: {
    height: 48,
    borderRadius: radii.sm,
    backgroundColor: colors.green,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaTxt: { color: "#fff", fontWeight: "700", fontSize: 16 },
  smallCta: {
    height: 36,
    paddingHorizontal: 12,
    borderRadius: radii.sm,
    backgroundColor: colors.green,
    alignItems: "center",
    justifyContent: "center",
  },
});

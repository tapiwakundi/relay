import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, signOut } from "../lib/auth";
import { queryClient } from "../lib/query";
import { notifySignedOut } from "../lib/session";
import { useWorkspace } from "../lib/workspace";
import { Avatar } from "../ui/Avatar";
import { Glass } from "../ui/Glass";
import { ScreenHeader } from "../ui/Header";
import { colors, radii, space } from "../ui/theme";
import type { RootStackParamList } from "../nav/types";

export function YouScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { me, workspace } = useWorkspace();

  async function setPresence(presence: string) {
    await api("/api/me", { method: "PATCH", body: JSON.stringify({ presence }) });
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <Glass style={styles.head}>
        <ScreenHeader title="You" />
      </Glass>
      <ScrollView contentContainerStyle={{ padding: space.md, paddingBottom: 140 }}>
        <Pressable onPress={() => nav.navigate("EditProfile")}>
          <Glass style={styles.card}>
            <View style={styles.me}>
              <Avatar name={me.displayName} image={me.image} size={64} presence={me.presence} />
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>
                  {me.statusEmoji ? `${me.statusEmoji} ` : ""}
                  {me.displayName}
                </Text>
                <Text style={styles.sub}>{me.title || me.email}</Text>
                <Text style={styles.sub}>{me.statusText || me.presence}</Text>
              </View>
            </View>
          </Glass>
        </Pressable>

        <Text style={styles.sec}>Presence</Text>
        <Glass style={styles.group}>
          {(["active", "away", "dnd"] as const).map((p) => (
            <Pressable key={p} style={styles.row} onPress={() => void setPresence(p)}>
              <Text style={styles.rowTxt}>{p === "active" ? "Active" : p === "away" ? "Away" : "Do not disturb"}</Text>
              {me.presence === p ? <Text style={styles.check}>✓</Text> : null}
            </Pressable>
          ))}
        </Glass>

        <Text style={styles.sec}>{workspace.name}</Text>
        <Glass style={styles.group}>
          <Row label="Workspace settings" onPress={() => nav.navigate("WorkspaceSettings")} />
          <Row label="Invites" onPress={() => nav.navigate("Invites")} />
          <Row label="Saved for later" onPress={() => nav.navigate("Later")} />
          <Row label="Files" onPress={() => nav.navigate("Files")} />
          <Row label="Threads" onPress={() => nav.navigate("Threads")} />
        </Glass>

        <Pressable
          style={{ marginTop: 18 }}
          onPress={() => {
            Alert.alert("Sign out?", undefined, [
              { text: "Cancel", style: "cancel" },
              {
                text: "Sign out",
                style: "destructive",
                onPress: async () => {
                  await signOut();
                  queryClient.clear();
                  notifySignedOut();
                },
              },
            ]);
          }}
        >
          <Glass style={styles.group}>
            <Text style={[styles.rowTxt, styles.out]}>Sign out</Text>
          </Glass>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function Row({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <Text style={styles.rowTxt}>{label}</Text>
      <Text style={styles.chev}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  head: { marginHorizontal: 12, borderRadius: radii.lg },
  card: { padding: 16, borderRadius: radii.lg },
  me: { flexDirection: "row", gap: 14, alignItems: "center" },
  name: { color: colors.ink, fontSize: 20, fontWeight: "800" },
  sub: { color: colors.muted, marginTop: 2 },
  sec: {
    color: colors.muted,
    fontWeight: "800",
    textTransform: "uppercase",
    fontSize: 12,
    marginTop: 18,
    marginBottom: 8,
    letterSpacing: 0.6,
  },
  group: { borderRadius: radii.lg, overflow: "hidden" },
  row: {
    minHeight: 48,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rowTxt: { color: colors.ink, fontSize: 16, fontWeight: "600" },
  chev: { color: colors.faint, fontSize: 22 },
  check: { color: colors.green, fontWeight: "800" },
  out: { color: colors.pink, padding: 16, fontWeight: "800" },
});

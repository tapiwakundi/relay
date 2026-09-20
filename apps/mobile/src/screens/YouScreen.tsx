import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAccounts } from "../lib/account-manager";
import { api } from "../lib/auth";
import { useWorkspace } from "../lib/workspace";
import { Avatar } from "../ui/Avatar";
import { WorkspaceGlyph } from "../ui/Glyph";
import { FloatingWorkspaceChrome, ScreenCanvas, ScrollingHero, useCompactScroll } from "../ui/SlackChrome";
import { colors } from "../ui/theme";
import type { RootStackParamList } from "../nav/types";

export function YouScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { me, workspace, workspaces, selectWorkspace } = useWorkspace();
  const { accounts, activeAccountId, switchAccount, removeAccount } = useAccounts();
  const { compact, onScroll, scrollEventThrottle } = useCompactScroll();

  async function setPresence(presence: string) {
    await api("/api/me", { method: "PATCH", body: JSON.stringify({ presence }) });
  }

  return (
    <ScreenCanvas>
      <ScrollView
        scrollEventThrottle={scrollEventThrottle}
        onScroll={onScroll}
        contentContainerStyle={{ paddingBottom: 140 }}
      >
        <ScrollingHero title="You" />
        <View style={{ padding: 16 }}>
        <Pressable onPress={() => nav.navigate("EditProfile")} style={styles.card}>
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
        </Pressable>

        <Text style={styles.sec}>Presence</Text>
        <View style={styles.group}>
          {(["active", "away", "dnd"] as const).map((p) => (
            <Pressable key={p} style={styles.row} onPress={() => void setPresence(p)}>
              <Text style={styles.rowTxt}>{p === "active" ? "Active" : p === "away" ? "Away" : "Do not disturb"}</Text>
              {me.presence === p ? <Text style={styles.check}>✓</Text> : null}
            </Pressable>
          ))}
        </View>

        <Text style={styles.sec}>Workspaces</Text>
        <View style={styles.group}>
          {workspaces.map((ws) => (
            <Pressable key={ws.id} style={styles.row} onPress={() => void selectWorkspace(ws.id)}>
              <View style={[styles.glyph, { backgroundColor: ws.iconColor || colors.aubergine }]}>
                <Text style={styles.glyphTxt}>{(ws.iconLetter || ws.name[0] || "W").toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTxt}>{ws.name}</Text>
                <Text style={styles.slug}>{ws.slug}</Text>
              </View>
              {ws.id === workspace.id ? <Text style={styles.check}>✓</Text> : null}
            </Pressable>
          ))}
          {accounts
            .filter((account) => account.id !== (activeAccountId ?? me.id))
            .map((account) => (
              <Pressable key={account.id} style={styles.row} onPress={() => void switchAccount(account.id)}>
                <View style={[styles.glyph, { backgroundColor: account.workspace?.iconColor || colors.aubergine }]}>
                  <Text style={styles.glyphTxt}>
                    {(account.workspace?.iconLetter || account.name[0] || "W").toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTxt}>{account.workspace?.name || account.name}</Text>
                  <Text style={styles.slug}>{account.workspace?.slug || account.email}</Text>
                </View>
                <Text style={styles.chev}>›</Text>
              </Pressable>
            ))}
          <Pressable style={styles.row} onPress={() => nav.navigate("AddWorkspace")}>
            <View style={styles.glyph}>
              <Text style={styles.glyphTxt}>+</Text>
            </View>
            <Text style={styles.rowTxt}>Add a workspace</Text>
          </Pressable>
        </View>

        <Text style={styles.sec}>{workspace.name}</Text>
        <View style={styles.group}>
          <Row label="Workspace settings" onPress={() => nav.navigate("WorkspaceSettings")} />
          <Row label="Invites" onPress={() => nav.navigate("Invites")} />
          <Row label="Saved for later" onPress={() => nav.navigate("Later")} />
          <Row label="Files" onPress={() => nav.navigate("Files")} />
          <Row label="Threads" onPress={() => nav.navigate("Threads")} />
        </View>

        <Pressable
          style={{ marginTop: 18 }}
          onPress={() => {
            Alert.alert("Sign out?", `Sign out ${me.email}? Other accounts stay signed in.`, [
              { text: "Cancel", style: "cancel" },
              {
                text: "Sign out",
                style: "destructive",
                onPress: () => {
                  void removeAccount();
                },
              },
            ]);
          }}
        >
          <View style={styles.group}>
            <Text style={[styles.rowTxt, styles.out]}>Sign out</Text>
          </View>
        </Pressable>
        </View>
      </ScrollView>
      <FloatingWorkspaceChrome
        compact={compact}
        glyph={<WorkspaceGlyph workspace={workspace} size={compact ? 36 : 32} round={compact} />}
        meName={me.displayName}
        meImage={me.image}
        mePresence={me.presence}
        onWorkspacePress={() => nav.navigate("Home" as never)}
        onCompose={() => nav.navigate("NewDm")}
        onMe={() => nav.navigate("EditProfile")}
      />
    </ScreenCanvas>
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
  card: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.canvas,
  },
  me: { flexDirection: "row", gap: 14, alignItems: "center" },
  name: { color: colors.ink, fontSize: 20, fontWeight: "800" },
  sub: { color: colors.muted, marginTop: 2 },
  sec: {
    color: colors.muted,
    fontWeight: "700",
    fontSize: 13,
    marginTop: 18,
    marginBottom: 8,
  },
  group: {
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.canvas,
  },
  row: {
    minHeight: 52,
    paddingHorizontal: 16,
    gap: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  glyph: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: colors.aubergine,
    alignItems: "center",
    justifyContent: "center",
  },
  glyphTxt: { color: "#fff", fontWeight: "800", fontSize: 16 },
  slug: { color: colors.muted, fontSize: 13, marginTop: 1 },
  rowTxt: { color: colors.ink, fontSize: 16, fontWeight: "600" },
  chev: { color: colors.faint, fontSize: 22 },
  check: { color: colors.green, fontWeight: "800" },
  out: { color: colors.pink, padding: 16, fontWeight: "800" },
});

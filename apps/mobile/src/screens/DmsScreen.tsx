import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useWorkspace } from "../lib/workspace";
import { Avatar } from "../ui/Avatar";
import { WorkspaceGlyph } from "../ui/Glyph";
import { FloatingWorkspaceChrome, ScreenCanvas, ScrollingHero, useCompactScroll } from "../ui/SlackChrome";
import { colors } from "../ui/theme";
import type { RootStackParamList } from "../nav/types";

export function DmsScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { channels, members, me, workspace } = useWorkspace();
  const { compact, onScroll, scrollEventThrottle } = useCompactScroll();
  const dms = channels.filter((c) => c.isDm);

  return (
    <ScreenCanvas>
      <ScrollView
        scrollEventThrottle={scrollEventThrottle}
        onScroll={onScroll}
        contentContainerStyle={{ paddingBottom: 120 + insets.bottom }}
      >
        <ScrollingHero title="Direct messages" />
        {dms.map((c) => {
          const other = members.find((m) => c.dmName === m.displayName || c.dmName === m.name);
          return (
            <Pressable key={c.id} style={styles.row} onPress={() => nav.navigate("Channel", { channelId: c.id })}>
              <Avatar name={c.dmName ?? c.name} image={other?.image} presence={other?.presence} size={40} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.name, c.unreadCount ? styles.unread : null]}>{c.dmName ?? c.name}</Text>
                <Text style={styles.sub}>{other?.statusText || other?.title || other?.presence || "teammate"}</Text>
              </View>
              {c.unreadCount ? (
                <View style={styles.pill}>
                  <Text style={styles.pillTxt}>{c.unreadCount}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
        {!dms.length ? <Text style={styles.empty}>No DMs yet. Tap compose to start one.</Text> : null}
        <Text style={styles.sec}>People</Text>
        {members
          .filter((m) => m.userId !== me.id)
          .map((m) => (
            <Pressable key={m.userId} style={styles.row} onPress={() => nav.navigate("Profile", { userId: m.userId })}>
              <Avatar name={m.displayName} image={m.image} presence={m.presence} size={40} />
              <View>
                <Text style={styles.name}>{m.displayName}</Text>
                <Text style={styles.sub}>{m.title || m.email}</Text>
              </View>
            </Pressable>
          ))}
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

const styles = StyleSheet.create({
  sec: { color: colors.muted, fontWeight: "700", fontSize: 13, marginTop: 18, marginBottom: 4, marginHorizontal: 16 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  name: { color: colors.ink, fontSize: 16, fontWeight: "700" },
  unread: { fontWeight: "900" },
  sub: { color: colors.muted, fontSize: 13, marginTop: 2 },
  empty: { color: colors.muted, padding: 16 },
  pill: {
    backgroundColor: colors.unread,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  pillTxt: { color: "#fff", fontSize: 12, fontWeight: "800" },
});

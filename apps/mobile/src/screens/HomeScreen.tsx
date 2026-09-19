import { type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Channel } from "@relay/shared";
import { useWorkspace } from "../lib/workspace";
import { api } from "../lib/auth";
import { keys, queryClient } from "../lib/query";
import { Glass } from "../ui/Glass";
import { WorkspaceGlyph } from "../ui/Glyph";
import { HeaderBtn, ScreenHeader } from "../ui/Header";
import { colors, radii, space } from "../ui/theme";
import type { RootStackParamList } from "../nav/types";

export function HomeScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { workspace, channels } = useWorkspace();
  const starred = channels.filter((c) => c.isStarred && !c.isDm);
  const listed = channels.filter((c) => !c.isDm && !c.isStarred);
  const huddles = channels.filter((c) => c.huddle?.active);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <Glass style={styles.head}>
        <ScreenHeader
          title={workspace.name}
          left={<WorkspaceGlyph workspace={workspace} size={32} onPress={() => nav.navigate("WorkspaceSettings")} />}
          right={<HeaderBtn label="⌕" onPress={() => nav.navigate("Search")} />}
        />
      </Glass>
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        {huddles.length ? (
          <Section title="Huddles">
            {huddles.map((c) => (
              <ChannelRow key={c.id} channel={c} huddle onPress={() => nav.navigate("Channel", { channelId: c.id })} />
            ))}
          </Section>
        ) : null}
        {starred.length ? (
          <Section title="Starred">
            {starred.map((c) => (
              <ChannelRow key={c.id} channel={c} onPress={() => nav.navigate("Channel", { channelId: c.id })} />
            ))}
          </Section>
        ) : null}
        <Section
          title="Channels"
          action="+ Add"
          onAction={() => nav.navigate("NewChannel")}
        >
          {listed.map((c) => (
            <ChannelRow key={c.id} channel={c} onPress={() => nav.navigate("Channel", { channelId: c.id })} />
          ))}
        </Section>
      </ScrollView>
    </View>
  );
}

function Section({
  title,
  children,
  action,
  onAction,
}: {
  title: string;
  children: ReactNode;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={{ marginTop: 18, paddingHorizontal: space.md }}>
      <View style={styles.secHead}>
        <Text style={styles.sec}>{title}</Text>
        {action ? (
          <Pressable onPress={onAction}>
            <Text style={styles.add}>{action}</Text>
          </Pressable>
        ) : null}
      </View>
      <Glass style={styles.group}>{children}</Glass>
    </View>
  );
}

function ChannelRow({ channel, onPress, huddle }: { channel: Channel; onPress: () => void; huddle?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={() => {
        void api(`/api/channels/${channel.id}/star`, { method: "POST" }).then(() =>
          queryClient.invalidateQueries({ queryKey: ["bootstrap"] }),
        );
      }}
      style={styles.row}
    >
      <Text style={[styles.hash, channel.unreadCount ? styles.unread : null]}>
        {channel.isPrivate ? "🔒" : "#"} {channel.name}
      </Text>
      <View style={styles.badges}>
        {huddle ? <Text style={styles.huddle}>● huddle</Text> : null}
        {channel.mentionCount ? (
          <View style={styles.pill}>
            <Text style={styles.pillTxt}>{channel.mentionCount}</Text>
          </View>
        ) : channel.unreadCount ? (
          <View style={[styles.pill, styles.dot]} />
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  head: { marginHorizontal: 12, marginBottom: 4, borderRadius: radii.lg },
  secHead: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  sec: { color: colors.muted, fontWeight: "800", textTransform: "uppercase", fontSize: 12, letterSpacing: 0.6 },
  add: { color: colors.ink, fontWeight: "700" },
  group: { borderRadius: radii.lg, overflow: "hidden" },
  row: {
    minHeight: 48,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  hash: { color: colors.ink, fontSize: 16 },
  unread: { fontWeight: "800" },
  badges: { flexDirection: "row", alignItems: "center", gap: 8 },
  huddle: { color: colors.green, fontWeight: "700", fontSize: 12 },
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
  dot: { width: 10, minWidth: 10, height: 10, paddingHorizontal: 0 },
});

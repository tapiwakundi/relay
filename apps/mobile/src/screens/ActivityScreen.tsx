import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import type { ActivityItem } from "@relay/shared";
import { api } from "../lib/auth";
import { formatTime } from "../lib/format";
import { keys } from "../lib/query";
import { useWorkspace } from "../lib/workspace";
import { Avatar } from "../ui/Avatar";
import { WorkspaceGlyph } from "../ui/Glyph";
import { MessageBody } from "../ui/MessageBody";
import { FloatingWorkspaceChrome, ScreenCanvas, ScrollingHero, useCompactScroll } from "../ui/SlackChrome";
import { colors } from "../ui/theme";
import type { RootStackParamList } from "../nav/types";

export function ActivityScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { workspace, me } = useWorkspace();
  const { compact, onScroll, scrollEventThrottle } = useCompactScroll();
  const q = useQuery({
    queryKey: keys.activity(workspace.id),
    queryFn: () => api<{ items: ActivityItem[] }>("/api/activity"),
  });
  const items = q.data?.items ?? [];

  return (
    <ScreenCanvas>
      <ScrollView
        scrollEventThrottle={scrollEventThrottle}
        onScroll={onScroll}
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        <ScrollingHero title="Activity" />
        {!items.length ? <Text style={styles.empty}>Mentions, reactions, and thread replies land here.</Text> : null}
        {items.map((item) => (
          <Pressable key={item.id} onPress={() => nav.navigate("Channel", { channelId: item.channelId })} style={styles.card}>
            <Text style={styles.kind}>
              {item.kind === "mention" ? "Mentioned you" : item.kind === "reaction" ? `Reacted ${item.emoji ?? ""}` : "Thread reply"} · #
              {item.channelName} · {formatTime(item.at)}
            </Text>
            <View style={styles.row}>
              <Avatar name={item.message.userName} image={item.message.userImage} size={32} />
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.message.userName}</Text>
                <MessageBody body={item.message.body} />
              </View>
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
  card: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline },
  kind: { color: colors.muted, fontSize: 12, fontWeight: "700", marginBottom: 8 },
  row: { flexDirection: "row", gap: 10 },
  name: { color: colors.ink, fontWeight: "800", marginBottom: 2 },
  empty: { color: colors.muted, padding: 16 },
});

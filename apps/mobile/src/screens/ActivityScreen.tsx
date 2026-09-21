import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
  const insets = useSafeAreaInsets();
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { workspace, me } = useWorkspace();
  const { compact, onScroll, scrollEventThrottle } = useCompactScroll();
  const q = useQuery({
    queryKey: keys.activity(workspace.id),
    queryFn: () => api<{ items: ActivityItem[] }>("/api/activity"),
    refetchOnMount: "always",
  });
  const items = q.data?.items ?? [];

  function openItem(item: ActivityItem) {
    const parentId = item.message.parentId ?? (item.kind === "thread" ? item.message.id : null);
    if (parentId) {
      nav.navigate("Thread", { channelId: item.channelId, parentId });
      return;
    }
    nav.navigate("Channel", { channelId: item.channelId });
  }

  return (
    <ScreenCanvas>
      <ScrollView
        scrollEventThrottle={scrollEventThrottle}
        onScroll={onScroll}
        refreshControl={<RefreshControl refreshing={q.isRefetching && !q.isPending} onRefresh={() => void q.refetch()} />}
        contentContainerStyle={{ paddingBottom: 120 + insets.bottom }}
      >
        <ScrollingHero title="Activity" />
        {q.isPending && !q.data ? (
          <ActivityIndicator style={styles.busy} color={colors.aubergine} />
        ) : q.isError && !q.data ? (
          <Pressable onPress={() => void q.refetch()} style={styles.emptyWrap}>
            <Text style={styles.empty}>Couldn’t load activity. Tap to retry.</Text>
          </Pressable>
        ) : !items.length ? (
          <Text style={styles.empty}>Mentions, reactions, and thread replies land here.</Text>
        ) : (
          items.map((item) => {
            const msg = item.message;
            const label =
              item.kind === "mention"
                ? "Mentioned you"
                : item.kind === "reaction"
                  ? `Reacted ${item.emoji ?? ""}`
                  : "Replied in a thread";
            return (
              <Pressable key={item.id} onPress={() => openItem(item)} style={styles.card}>
                <Text style={styles.kind}>
                  {label} · #{item.channelName} · {formatTime(item.at)}
                </Text>
                <View style={styles.row}>
                  <Avatar name={msg?.userName ?? "Unknown"} image={msg?.userImage} size={32} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{msg?.userName ?? "Unknown"}</Text>
                    <MessageBody body={msg?.body ?? ""} />
                  </View>
                </View>
              </Pressable>
            );
          })
        )}
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
  card: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
  },
  kind: { color: colors.muted, fontSize: 12, fontWeight: "700", marginBottom: 8 },
  row: { flexDirection: "row", gap: 10 },
  name: { color: colors.ink, fontWeight: "800", marginBottom: 2 },
  empty: { color: colors.muted, padding: 16 },
  emptyWrap: { paddingVertical: 8 },
  busy: { marginTop: 28 },
});

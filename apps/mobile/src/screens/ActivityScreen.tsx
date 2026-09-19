import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ActivityItem } from "@relay/shared";
import { api } from "../lib/auth";
import { formatTime } from "../lib/format";
import { keys } from "../lib/query";
import { Avatar } from "../ui/Avatar";
import { Glass } from "../ui/Glass";
import { ScreenHeader } from "../ui/Header";
import { MessageBody } from "../ui/MessageBody";
import { colors, radii, space } from "../ui/theme";
import type { RootStackParamList } from "../nav/types";

export function ActivityScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const q = useQuery({
    queryKey: keys.activity,
    queryFn: () => api<{ items: ActivityItem[] }>("/api/activity"),
  });
  const items = q.data?.items ?? [];

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <Glass style={styles.head}>
        <ScreenHeader title="Activity" />
      </Glass>
      <ScrollView contentContainerStyle={{ padding: space.md, paddingBottom: 120 }}>
        {!items.length ? <Text style={styles.empty}>Mentions, reactions, and thread replies land here.</Text> : null}
        {items.map((item) => (
          <Pressable
            key={item.id}
            onPress={() => nav.navigate("Channel", { channelId: item.channelId })}
            style={{ marginBottom: 10 }}
          >
            <Glass style={styles.card}>
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
            </Glass>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  head: { marginHorizontal: 12, borderRadius: radii.lg },
  card: { padding: 12, borderRadius: radii.md },
  kind: { color: colors.muted, fontSize: 12, fontWeight: "700", marginBottom: 8 },
  row: { flexDirection: "row", gap: 10 },
  name: { color: colors.ink, fontWeight: "800", marginBottom: 2 },
  empty: { color: colors.muted, padding: 12 },
});

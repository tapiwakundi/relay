import { type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ChatMessage, FileItem } from "@relay/shared";
import { api } from "../lib/auth";
import { formatTime } from "../lib/format";
import { keys } from "../lib/query";
import { Avatar } from "../ui/Avatar";
import { Glass } from "../ui/Glass";
import { HeaderBtn, ScreenHeader } from "../ui/Header";
import { MessageBody } from "../ui/MessageBody";
import { colors, radii, space } from "../ui/theme";
import type { RootStackParamList } from "../nav/types";

export function LaterScreen({ navigation }: NativeStackScreenProps<RootStackParamList, "Later">) {
  const insets = useSafeAreaInsets();
  const q = useQuery({
    queryKey: keys.later,
    queryFn: () => api<{ items: ChatMessage[] }>("/api/later"),
  });
  return (
    <ListScreen
      title="Later"
      insetsTop={insets.top}
      onBack={() => navigation.goBack()}
      empty="Saved messages show up here."
    >
      {(q.data?.items ?? []).map((m) => (
        <Pressable key={m.id} onPress={() => navigation.navigate("Channel", { channelId: m.channelId })}>
          <Glass style={styles.card}>
            <View style={styles.row}>
              <Avatar name={m.userName} image={m.userImage} size={32} />
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{m.userName}</Text>
                <MessageBody body={m.body} />
              </View>
            </View>
          </Glass>
        </Pressable>
      ))}
    </ListScreen>
  );
}

export function FilesScreen({ navigation }: NativeStackScreenProps<RootStackParamList, "Files">) {
  const insets = useSafeAreaInsets();
  const q = useQuery({
    queryKey: keys.files,
    queryFn: () => api<{ items: FileItem[] }>("/api/files"),
  });
  return (
    <ListScreen title="Files" insetsTop={insets.top} onBack={() => navigation.goBack()} empty="Shared files land here.">
      {(q.data?.items ?? []).map((f) => (
        <Pressable key={f.messageId} onPress={() => navigation.navigate("Channel", { channelId: f.channelId })}>
          <Glass style={styles.card}>
            <Text style={styles.name}>{f.fileName}</Text>
            <Text style={styles.meta}>
              #{f.channelName} · {f.userName} · {formatTime(f.createdAt)}
            </Text>
          </Glass>
        </Pressable>
      ))}
    </ListScreen>
  );
}

export function ThreadsScreen({ navigation }: NativeStackScreenProps<RootStackParamList, "Threads">) {
  const insets = useSafeAreaInsets();
  const q = useQuery({
    queryKey: keys.threads,
    queryFn: () => api<{ items: ChatMessage[] }>("/api/threads"),
  });
  return (
    <ListScreen title="Threads" insetsTop={insets.top} onBack={() => navigation.goBack()} empty="No threads yet.">
      {(q.data?.items ?? []).map((m) => (
        <Pressable
          key={m.id}
          onPress={() => navigation.navigate("Thread", { channelId: m.channelId, parentId: m.id })}
        >
          <Glass style={styles.card}>
            <Text style={styles.name}>
              {m.userName} · {m.replyCount} replies
            </Text>
            <MessageBody body={m.body} />
          </Glass>
        </Pressable>
      ))}
    </ListScreen>
  );
}

function ListScreen({
  title,
  insetsTop,
  onBack,
  empty,
  children,
}: {
  title: string;
  insetsTop: number;
  onBack: () => void;
  empty: string;
  children: ReactNode;
}) {
  const emptyList = Array.isArray(children) ? children.length === 0 : !children;
  return (
    <View style={{ flex: 1, paddingTop: insetsTop }}>
      <Glass style={{ marginHorizontal: 12, borderRadius: radii.lg }}>
        <ScreenHeader title={title} left={<HeaderBtn label="‹" onPress={onBack} />} />
      </Glass>
      <ScrollView contentContainerStyle={{ padding: space.md, gap: 10, paddingBottom: 40 }}>
        {emptyList ? <Text style={styles.empty}>{empty}</Text> : children}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 14, borderRadius: radii.md, gap: 4 },
  row: { flexDirection: "row", gap: 10 },
  name: { color: colors.ink, fontWeight: "800" },
  meta: { color: colors.muted },
  empty: { color: colors.muted, padding: 12 },
});

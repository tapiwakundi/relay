import { type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ChatMessage, FileItem } from "@relay/shared";
import { api } from "../lib/auth";
import { formatTime } from "../lib/format";
import { keys } from "../lib/query";
import { useWorkspace } from "../lib/workspace";
import { Avatar } from "../ui/Avatar";
import { MessageBody } from "../ui/MessageBody";
import { PageHeader, ScreenCanvas } from "../ui/SlackChrome";
import { colors, space } from "../ui/theme";
import type { RootStackParamList } from "../nav/types";

export function LaterScreen({ navigation }: NativeStackScreenProps<RootStackParamList, "Later">) {
  const { workspace } = useWorkspace();
  const q = useQuery({
    queryKey: keys.later(workspace.id),
    queryFn: () => api<{ items: ChatMessage[] }>("/api/later"),
  });
  return (
    <ListScreen title="Later" onBack={() => navigation.goBack()} empty="Saved messages show up here.">
      {(q.data?.items ?? []).map((m) => (
        <Pressable key={m.id} onPress={() => navigation.navigate("Channel", { channelId: m.channelId })}>
          <View style={styles.card}>
            <View style={styles.row}>
              <Avatar name={m.userName} image={m.userImage} size={32} />
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{m.userName}</Text>
                <MessageBody body={m.body} />
              </View>
            </View>
          </View>
        </Pressable>
      ))}
    </ListScreen>
  );
}

export function FilesScreen({ navigation }: NativeStackScreenProps<RootStackParamList, "Files">) {
  const { workspace } = useWorkspace();
  const q = useQuery({
    queryKey: keys.files(workspace.id),
    queryFn: () => api<{ items: FileItem[] }>("/api/files"),
  });
  return (
    <ListScreen title="Files" onBack={() => navigation.goBack()} empty="Shared files land here.">
      {(q.data?.items ?? []).map((f) => (
        <Pressable key={f.messageId} onPress={() => navigation.navigate("Channel", { channelId: f.channelId })}>
          <View style={styles.card}>
            <Text style={styles.name}>{f.fileName}</Text>
            <Text style={styles.meta}>
              #{f.channelName} · {f.userName} · {formatTime(f.createdAt)}
            </Text>
          </View>
        </Pressable>
      ))}
    </ListScreen>
  );
}

export function ThreadsScreen({ navigation }: NativeStackScreenProps<RootStackParamList, "Threads">) {
  const { workspace } = useWorkspace();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: keys.threads(workspace.id),
    queryFn: () => api<{ items: ChatMessage[] }>("/api/threads"),
  });
  return (
    <ListScreen title="Threads" onBack={() => navigation.goBack()} empty="No threads yet.">
      {(q.data?.items ?? []).map((m) => (
        <Pressable
          key={m.id}
          onPress={() => {
            qc.setQueryData(keys.message(m.id), m);
            navigation.navigate("Thread", { channelId: m.channelId, parentId: m.id });
          }}
        >
          <View style={styles.card}>
            <Text style={styles.name}>
              {m.userName} · {m.replyCount} replies
            </Text>
            <MessageBody body={m.body} />
          </View>
        </Pressable>
      ))}
    </ListScreen>
  );
}

function ListScreen({
  title,
  onBack,
  empty,
  children,
}: {
  title: string;
  onBack: () => void;
  empty: string;
  children: ReactNode;
}) {
  const emptyList = Array.isArray(children) ? children.length === 0 : !children;
  return (
    <ScreenCanvas>
      <PageHeader title={title} onBack={onBack} />
      <ScrollView contentContainerStyle={{ padding: space.md, gap: 10, paddingBottom: 40 }}>
        {emptyList ? <Text style={styles.empty}>{empty}</Text> : children}
      </ScrollView>
    </ScreenCanvas>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 14,
    borderRadius: 12,
    gap: 4,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.canvas,
  },
  row: { flexDirection: "row", gap: 10 },
  name: { color: colors.ink, fontWeight: "800" },
  meta: { color: colors.muted },
  empty: { color: colors.muted, padding: 12 },
});

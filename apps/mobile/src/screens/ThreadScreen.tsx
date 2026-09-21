import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ChatMessage } from "@relay/shared";
import { api } from "../lib/auth";
import { keys } from "../lib/query";
import { useWorkspace } from "../lib/workspace";
import { ChatView } from "../ui/ChatView";
import { chatHeaderInset, FloatingChatHeader } from "../ui/FloatingChatHeader";
import { ScreenCanvas } from "../ui/SlackChrome";
import type { RootStackParamList } from "../nav/types";

type Props = NativeStackScreenProps<RootStackParamList, "Thread">;

export function ThreadScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { channelById, me } = useWorkspace();
  const channel = channelById(route.params.channelId);
  const [busy, setBusy] = useState(false);
  const parentQ = useQuery({
    queryKey: keys.message(route.params.parentId),
    initialData:
      qc.getQueryData<ChatMessage>(keys.message(route.params.parentId)) ??
      qc
        .getQueryData<{ messages: ChatMessage[] }>(keys.messages(route.params.channelId, null))
        ?.messages.find((m) => m.id === route.params.parentId),
    queryFn: () => api<{ message: ChatMessage }>(`/api/messages/${route.params.parentId}`).then((r) => r.message),
  });
  if (!channel) return null;

  const inHuddle = channel.huddle?.participants.some((p) => p.userId === me.id);

  async function huddle() {
    if (!channel) return;
    setBusy(true);
    try {
      await api(`/api/channels/${channel.id}/huddle/${inHuddle ? "leave" : "join"}`, { method: "POST" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScreenCanvas>
      <ChatView
        channel={channel}
        parentId={route.params.parentId}
        topInset={chatHeaderInset(insets.top)}
        onOpenThread={() => undefined}
        onOpenProfile={(userId) => navigation.navigate("Profile", { userId })}
      />
      <FloatingChatHeader
        title="Thread"
        subtitle={parentQ.data?.userName}
        showPerson
        onBack={() => navigation.goBack()}
        onTitlePress={parentQ.data ? () => navigation.navigate("Profile", { userId: parentQ.data!.userId }) : undefined}
        onHuddle={() => void huddle()}
        huddleJoined={inHuddle}
        huddleBusy={busy}
      />
    </ScreenCanvas>
  );
}

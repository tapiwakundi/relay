import { useState } from "react";
import { StyleSheet, Text } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../lib/auth";
import { keys } from "../lib/query";
import { useWorkspace } from "../lib/workspace";
import { ChatView } from "../ui/ChatView";
import { chatHeaderInset, FloatingChatHeader } from "../ui/FloatingChatHeader";
import { ScreenCanvas } from "../ui/SlackChrome";
import { colors } from "../ui/theme";
import type { RootStackParamList } from "../nav/types";

type Props = NativeStackScreenProps<RootStackParamList, "Channel">;

export function ChannelScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { channelById, me, members } = useWorkspace();
  const channel = channelById(route.params.channelId);
  const [busy, setBusy] = useState(false);

  if (!channel) {
    return (
      <ScreenCanvas>
        <Text style={styles.miss}>Channel missing</Text>
      </ScreenCanvas>
    );
  }

  const title = channel.isDm ? channel.dmName ?? channel.name : channel.name;
  const other = channel.isDm
    ? members.find((m) => m.userId !== me.id && (m.displayName === channel.dmName || m.name === channel.dmName))
    : undefined;
  const inHuddle = channel.huddle?.participants.some((p) => p.userId === me.id);
  const huddleActive = Boolean(channel.huddle?.active);
  const subtitle = huddleActive
    ? `${channel.huddle!.participants.length} in huddle`
    : channel.topic ?? (channel.isDm ? "Direct message" : `${channel.memberCount} members`);

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
        parentId={null}
        topInset={chatHeaderInset(insets.top)}
        onOpenThread={(msg) => {
          qc.setQueryData(keys.message(msg.id), msg);
          navigation.navigate("Thread", { channelId: channel.id, parentId: msg.id });
        }}
        onOpenProfile={(userId) => navigation.navigate("Profile", { userId })}
      />
      <FloatingChatHeader
        title={title}
        subtitle={subtitle}
        avatarName={other?.displayName ?? title}
        avatarImage={other?.image}
        showHash={!channel.isDm}
        onBack={() => navigation.goBack()}
        onTitlePress={other ? () => navigation.navigate("Profile", { userId: other.userId }) : undefined}
        onHuddle={() => void huddle()}
        huddleJoined={inHuddle}
        huddleBusy={busy}
      />
    </ScreenCanvas>
  );
}

const styles = StyleSheet.create({
  miss: { color: colors.ink, padding: 24 },
});

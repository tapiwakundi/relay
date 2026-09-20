import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { api } from "../lib/auth";
import { useWorkspace } from "../lib/workspace";
import { ChatView } from "../ui/ChatView";
import { HeaderBtn } from "../ui/Header";
import { PageHeader, ScreenCanvas } from "../ui/SlackChrome";
import { colors } from "../ui/theme";
import type { RootStackParamList } from "../nav/types";

type Props = NativeStackScreenProps<RootStackParamList, "Channel">;

export function ChannelScreen({ navigation, route }: Props) {
  const { channelById, me } = useWorkspace();
  const channel = channelById(route.params.channelId);
  const [busy, setBusy] = useState(false);

  if (!channel) {
    return (
      <ScreenCanvas>
        <Text style={styles.miss}>Channel missing</Text>
      </ScreenCanvas>
    );
  }

  const title = channel.isDm ? channel.dmName ?? channel.name : `#${channel.name}`;
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
      <PageHeader
        title={title}
        subtitle={channel.topic ?? (channel.isDm ? "Direct message" : `${channel.memberCount} members`)}
        left={<HeaderBtn label="‹" onPress={() => navigation.goBack()} />}
        right={<HeaderBtn label={inHuddle ? "Leave" : "Huddle"} onPress={() => void huddle()} />}
      />
      {channel.huddle?.active ? (
        <View style={styles.huddle}>
          <Text style={styles.huddleTxt}>
            {channel.huddle.participants.length} in huddle · audio is on desktop/web for now
          </Text>
          <Pressable onPress={() => void huddle()} disabled={busy}>
            <Text style={styles.huddleBtn}>{inHuddle ? "Leave" : "Join"}</Text>
          </Pressable>
        </View>
      ) : null}
      <ChatView
        channel={channel}
        parentId={null}
        onOpenThread={(msg) => navigation.navigate("Thread", { channelId: channel.id, parentId: msg.id })}
        onOpenProfile={(userId) => navigation.navigate("Profile", { userId })}
      />
    </ScreenCanvas>
  );
}

const styles = StyleSheet.create({
  miss: { color: colors.ink, padding: 24 },
  huddle: {
    marginHorizontal: 12,
    marginVertical: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.hairline,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  huddleTxt: { color: colors.ink, flex: 1, paddingRight: 8, fontSize: 13 },
  huddleBtn: { color: colors.green, fontWeight: "800" },
});

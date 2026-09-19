import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../lib/auth";
import { useWorkspace } from "../lib/workspace";
import { ChatView } from "../ui/ChatView";
import { Glass } from "../ui/Glass";
import { HeaderBtn, ScreenHeader } from "../ui/Header";
import { colors, radii } from "../ui/theme";
import type { RootStackParamList } from "../nav/types";

type Props = NativeStackScreenProps<RootStackParamList, "Channel">;

export function ChannelScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { channelById, me } = useWorkspace();
  const channel = channelById(route.params.channelId);
  const [busy, setBusy] = useState(false);

  if (!channel) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <Text style={styles.miss}>Channel missing</Text>
      </View>
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
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <Glass style={styles.head}>
        <ScreenHeader
          title={title}
          subtitle={channel.topic ?? (channel.isDm ? "Direct message" : `${channel.memberCount} members`)}
          left={<HeaderBtn label="‹" onPress={() => navigation.goBack()} />}
          right={<HeaderBtn label={inHuddle ? "Leave" : "Huddle"} onPress={() => void huddle()} />}
        />
      </Glass>
      {channel.huddle?.active ? (
        <Glass style={styles.huddle}>
          <Text style={styles.huddleTxt}>
            {channel.huddle.participants.length} in huddle · audio is on desktop/web for now
          </Text>
          <Pressable onPress={() => void huddle()} disabled={busy}>
            <Text style={styles.huddleBtn}>{inHuddle ? "Leave" : "Join"}</Text>
          </Pressable>
        </Glass>
      ) : null}
      <ChatView
        channel={channel}
        parentId={null}
        onOpenThread={(msg) => navigation.navigate("Thread", { channelId: channel.id, parentId: msg.id })}
        onOpenProfile={(userId) => navigation.navigate("Profile", { userId })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  head: { marginHorizontal: 12, marginBottom: 8, borderRadius: radii.lg },
  miss: { color: colors.ink, padding: 24 },
  huddle: {
    marginHorizontal: 12,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radii.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  huddleTxt: { color: colors.ink, flex: 1, paddingRight: 8, fontSize: 13 },
  huddleBtn: { color: colors.green, fontWeight: "800" },
});

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Keyboard, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Channel, Member } from "@relay/shared";
import { api } from "../lib/auth";
import { useWorkspace } from "../lib/workspace";
import { Avatar } from "../ui/Avatar";
import { IconHash, IconLock } from "../ui/Icons";
import { PageHeader, ScreenCanvas } from "../ui/SlackChrome";
import { colors } from "../ui/theme";
import type { RootStackParamList } from "../nav/types";

type Props = NativeStackScreenProps<RootStackParamList, "NewDm">;

type Target = {
  key: string;
  title: string;
  icon: ReactNode;
  channelId?: string;
  userId?: string;
};

export function NewDmScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { members, me, workspace, channels } = useWorkspace();
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [keyboard, setKeyboard] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const show = Keyboard.addListener(showEvent, (e) => setKeyboard(e.endCoordinates.height));
    const hide = Keyboard.addListener(hideEvent, () => setKeyboard(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const all = useMemo(() => browseTargets(channels, members, me.id), [channels, members, me.id]);
  const needle = query.trim().toLowerCase();
  const targets = needle ? all.filter((row) => row.title.toLowerCase().includes(needle)) : all;
  const chosen = all.find((row) => row.key === selected) ?? null;

  async function send() {
    const body = draft.trim();
    if (!chosen || !body || busy) {
      if (!chosen) setError("Choose a channel or conversation");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let channelId = chosen.channelId;
      if (!channelId && chosen.userId) {
        const opened = await api<{ channel: { id: string } }>("/api/dms", {
          method: "POST",
          body: JSON.stringify({ userId: chosen.userId, workspaceId: workspace.id }),
        });
        channelId = opened.channel.id;
      }
      if (!channelId) return;
      await api(`/api/channels/${channelId}/messages`, {
        method: "POST",
        body: JSON.stringify({ body }),
      });
      navigation.replace("Channel", { channelId });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <ScreenCanvas>
      <View style={[styles.root, { paddingBottom: keyboard }]}>
        <PageHeader title="New Message" sheet back="close" onBack={() => navigation.goBack()} />
        <View style={styles.toRow}>
          <Text style={styles.to}>To:</Text>
          <TextInput
            style={styles.toInput}
            placeholder="Search for a channel or conversation"
            placeholderTextColor={colors.faint}
            value={query}
            onChangeText={setQuery}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
        <View style={styles.rule} />
        {error ? <Text style={styles.err}>{error}</Text> : null}
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.list}>
          {targets.map((row) => {
            const on = row.key === selected;
            return (
              <Pressable
                key={row.key}
                style={styles.row}
                onPress={() => setSelected(on ? null : row.key)}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
              >
                {row.icon}
                <Text style={styles.name} numberOfLines={1}>
                  {row.title}
                </Text>
                <View style={[styles.radio, on && styles.radioOn]} />
              </Pressable>
            );
          })}
        </ScrollView>
        <View style={[styles.composeWrap, { paddingBottom: keyboard > 0 ? 8 : Math.max(insets.bottom, 8) }]}>
          <View style={styles.compose}>
            <Ionicons name="add" size={22} color={colors.muted} />
            <TextInput
              style={styles.draft}
              placeholder="Write a message"
              placeholderTextColor={colors.faint}
              value={draft}
              onChangeText={setDraft}
              editable={!busy}
              onSubmitEditing={() => void send()}
              returnKeyType="send"
            />
            {draft.trim() ? (
              <Pressable
                onPress={() => void send()}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel="Send"
                hitSlop={8}
              >
                <Ionicons name="arrow-up-circle" size={26} color={chosen ? colors.aubergine : colors.faint} />
              </Pressable>
            ) : (
              <Ionicons name="mic-outline" size={22} color={colors.muted} />
            )}
          </View>
        </View>
      </View>
    </ScreenCanvas>
  );
}

function browseTargets(channels: Channel[], members: Member[], meId: string): Target[] {
  const rows: Target[] = [];
  for (const channel of channels) {
    if (channel.isDm || channel.isMpim) {
      const name = channel.dmName ?? channel.name;
      const peer = members.find((m) => m.userId !== meId && (m.displayName === name || m.name === name));
      rows.push({
        key: channel.id,
        title: name,
        channelId: channel.id,
        icon: channel.isMpim ? (
          <View style={styles.group}>
            <Text style={styles.groupTxt}>{channel.memberCount}</Text>
          </View>
        ) : (
          <Avatar name={name} image={peer?.image} size={32} round />
        ),
      });
      continue;
    }
    rows.push({
      key: channel.id,
      title: channel.name,
      channelId: channel.id,
      icon: (
        <View style={styles.ico}>
          {channel.isPrivate ? <IconLock color={colors.ink} size={18} /> : <IconHash color={colors.ink} size={18} />}
        </View>
      ),
    });
  }
  for (const member of members) {
    if (member.userId === meId) continue;
    if (rows.some((row) => row.title === member.displayName)) continue;
    rows.push({
      key: member.userId,
      title: member.displayName,
      userId: member.userId,
      icon: <Avatar name={member.displayName} image={member.image} size={32} round />,
    });
  }
  return rows;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  toRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    minHeight: 48,
  },
  to: { color: colors.ink, fontSize: 17, fontWeight: "700" },
  toInput: { flex: 1, color: colors.ink, fontSize: 17, paddingVertical: 8 },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: "#E6E6E6", marginLeft: 16 },
  err: { color: colors.pink, paddingHorizontal: 16, paddingTop: 8 },
  list: { paddingVertical: 6 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    minHeight: 52,
  },
  ico: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  group: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#E8E8ED",
    alignItems: "center",
    justifyContent: "center",
  },
  groupTxt: { color: colors.ink, fontSize: 14, fontWeight: "700" },
  name: { flex: 1, color: colors.ink, fontSize: 17, fontWeight: "600" },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: "#C7C7CC",
  },
  radioOn: {
    borderWidth: 6,
    borderColor: colors.aubergine,
  },
  composeWrap: {
    paddingHorizontal: 12,
    paddingTop: 8,
    backgroundColor: colors.canvas,
  },
  compose: {
    minHeight: 44,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#D0D0D0",
    backgroundColor: "#fff",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    gap: 8,
  },
  draft: { flex: 1, color: colors.ink, fontSize: 17, paddingVertical: 8 },
});

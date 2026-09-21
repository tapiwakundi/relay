import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import * as Haptics from "expo-haptics";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { HuddleParticipant } from "@relay/shared";
import { leaveHuddleCall, setHuddleMicMuted } from "../lib/huddle-call";
import { useWorkspace } from "../lib/workspace";
import type { RootStackParamList } from "../nav/types";
import { Avatar } from "../ui/Avatar";
import { colors } from "../ui/theme";

type Props = NativeStackScreenProps<RootStackParamList, "Huddle">;

export function HuddleScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { channelById, me } = useWorkspace();
  const channel = channelById(route.params.channelId);
  const huddle = channel?.huddle?.active ? channel.huddle : null;
  const participants = huddle?.participants ?? [];
  const meInCall = participants.some((person) => person.userId === me.id);
  const mePerson = participants.find((person) => person.userId === me.id);
  const [muted, setMuted] = useState(Boolean(mePerson?.muted));
  const [busy, setBusy] = useState<"mute" | "leave" | null>(null);
  const sawLive = useRef(false);
  if (meInCall) sawLive.current = true;
  const ended = Boolean(channel && !huddle && sawLive.current);

  useEffect(() => {
    setMuted(Boolean(mePerson?.muted));
  }, [mePerson?.muted]);

  const place = !channel
    ? "Huddle"
    : channel.isDm
      ? (channel.dmName ?? channel.name)
      : `#${channel.name}`;

  async function toggleMute() {
    if (!channel || busy) return;
    const next = !muted;
    setMuted(next);
    setBusy("mute");
    void Haptics.selectionAsync();
    try {
      await setHuddleMicMuted(channel.id, next);
    } catch (err) {
      setMuted(!next);
      Alert.alert("Couldn't change mute", err instanceof Error ? err.message : "Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function leave() {
    if (!channel || busy) return;
    setBusy("leave");
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    try {
      await leaveHuddleCall(channel.id);
      navigation.goBack();
    } catch (err) {
      setBusy(null);
      Alert.alert("Couldn't leave the huddle", err instanceof Error ? err.message : "Try again.");
    }
  }

  const ordered = [...participants].sort((a, b) => Number(b.userId === me.id) - Number(a.userId === me.id));

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Back to conversation"
          hitSlop={10}
          style={styles.back}
        >
          <Ionicons name="chevron-down" size={28} color="#fff" />
        </Pressable>
        <View style={styles.titleWrap}>
          <Text style={styles.kicker}>Huddle</Text>
          <Text numberOfLines={1} style={styles.place}>
            {place}
          </Text>
        </View>
        <View style={styles.back} />
      </View>

      {!channel || !huddle ? (
        <View style={styles.empty}>
          {channel && !ended ? <ActivityIndicator color="#fff" /> : null}
          <Text style={styles.emptyTitle}>
            {!channel ? "Channel missing" : ended ? "This huddle ended" : "Joining the huddle"}
          </Text>
          <Pressable onPress={() => navigation.goBack()} style={styles.close} accessibilityRole="button">
            <Text style={styles.closeTxt}>Close</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.grid} showsVerticalScrollIndicator={false}>
            <Text style={styles.count}>
              {participants.length === 1 ? "Just you" : `${participants.length} people`}
            </Text>
            <View style={styles.faces}>
              {ordered.map((person) => (
                <Person key={person.userId} person={person} you={person.userId === me.id} />
              ))}
            </View>
            {participants.length === 1 ? <Text style={styles.waiting}>Waiting for others to join</Text> : null}
          </ScrollView>

          <View style={[styles.controls, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <Pressable
              onPress={() => void toggleMute()}
              disabled={!meInCall || busy === "leave"}
              accessibilityRole="button"
              accessibilityLabel={muted ? "Unmute" : "Mute"}
              style={styles.control}
            >
              <View style={[styles.circle, muted ? styles.circleMuted : styles.circleIdle]}>
                {busy === "mute" ? (
                  <ActivityIndicator color={muted ? "#fff" : colors.ink} />
                ) : (
                  <Ionicons name={muted ? "mic-off" : "mic"} size={26} color={muted ? "#fff" : colors.ink} />
                )}
              </View>
              <Text style={styles.controlLabel}>{muted ? "Unmute" : "Mute"}</Text>
            </Pressable>
            <Pressable
              onPress={() => void leave()}
              disabled={!meInCall || busy === "mute"}
              accessibilityRole="button"
              accessibilityLabel="Leave huddle"
              style={styles.control}
            >
              <View style={[styles.circle, styles.circleLeave]}>
                {busy === "leave" ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Ionicons name="call" size={26} color="#fff" style={styles.hangup} />
                )}
              </View>
              <Text style={styles.controlLabel}>Leave</Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

function Person({ person, you }: { person: HuddleParticipant; you: boolean }) {
  return (
    <View style={styles.person}>
      <View>
        <Avatar name={person.name} image={person.image} size={96} round />
        <View style={[styles.badge, person.muted ? styles.badgeMuted : styles.badgeLive]}>
          <Ionicons name={person.muted ? "mic-off" : "mic"} size={13} color="#fff" />
        </View>
      </View>
      <Text numberOfLines={1} style={styles.name}>
        {you ? "You" : person.name}
      </Text>
      <Text style={styles.state}>{person.muted ? "Muted" : "Live"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.wallpaper[0] },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingBottom: 8 },
  back: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  titleWrap: { flex: 1, alignItems: "center" },
  kicker: { color: "rgba(255,255,255,0.72)", fontSize: 13, fontWeight: "700", letterSpacing: 0.3 },
  place: { color: "#fff", fontSize: 17, fontWeight: "800", marginTop: 1 },
  grid: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 140, alignItems: "center" },
  count: { color: "rgba(255,255,255,0.78)", fontSize: 15, fontWeight: "600", marginBottom: 22 },
  faces: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 18 },
  person: { width: 148, alignItems: "center", gap: 8 },
  badge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.wallpaper[0],
  },
  badgeLive: { backgroundColor: colors.green },
  badgeMuted: { backgroundColor: colors.pink },
  name: { color: "#fff", fontSize: 16, fontWeight: "700", maxWidth: 140 },
  state: { color: "rgba(255,255,255,0.7)", fontSize: 13, fontWeight: "600", marginTop: -4 },
  waiting: { color: "rgba(255,255,255,0.7)", fontSize: 15, marginTop: 28 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 18 },
  emptyTitle: { color: "#fff", fontSize: 20, fontWeight: "700" },
  close: { backgroundColor: "rgba(255,255,255,0.16)", paddingHorizontal: 22, paddingVertical: 12, borderRadius: 22 },
  closeTxt: { color: "#fff", fontSize: 16, fontWeight: "700" },
  controls: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: 36,
    paddingTop: 12,
  },
  control: { alignItems: "center", gap: 8, minWidth: 84 },
  circle: { width: 68, height: 68, borderRadius: 34, alignItems: "center", justifyContent: "center" },
  circleIdle: { backgroundColor: "#fff" },
  circleMuted: { backgroundColor: colors.pink },
  circleLeave: { backgroundColor: colors.pink },
  hangup: { transform: [{ rotate: "135deg" }] },
  controlLabel: { color: "#fff", fontSize: 13, fontWeight: "700" },
});

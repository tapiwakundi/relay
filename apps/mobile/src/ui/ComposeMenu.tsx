import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Animated,
  BackHandler,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import type { Channel } from "@relay/shared";
import { joinHuddleCall } from "../lib/huddle-call";
import { useWorkspace } from "../lib/workspace";
import type { RootStackParamList } from "../nav/types";
import { Glass } from "./Glass";
import { IconHash, IconHeadphones, IconLock, IconPlus } from "./Icons";
import { colors } from "./theme";

type Panel = "menu" | "huddle";

export function ComposeMenu() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { channels } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(false);
  const [panel, setPanel] = useState<Panel>("menu");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const progress = useRef(new Animated.Value(0)).current;
  const openRef = useRef(open);
  const wasOpen = useRef(false);
  openRef.current = open;

  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      setShown(true);
      progress.stopAnimation();
      Animated.spring(progress, {
        toValue: 1,
        damping: 22,
        stiffness: 280,
        mass: 0.82,
        useNativeDriver: true,
      }).start();
      return;
    }
    if (!wasOpen.current) return;
    wasOpen.current = false;
    progress.stopAnimation();
    Animated.timing(progress, {
      toValue: 0,
      duration: 160,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !openRef.current) {
        setShown(false);
        setPanel("menu");
        setError(null);
      }
    });
  }, [open, progress]);

  useEffect(() => {
    if (!open) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (panel === "huddle") {
        setPanel("menu");
        setError(null);
        return true;
      }
      setOpen(false);
      return true;
    });
    return () => sub.remove();
  }, [open, panel]);

  function openMenu() {
    setPanel("menu");
    setError(null);
    setShown(true);
    setOpen(true);
    void Haptics.selectionAsync();
  }

  function close() {
    setOpen(false);
  }

  function go(run: () => void) {
    void Haptics.selectionAsync();
    close();
    run();
  }

  async function joinHuddle(channelId: string) {
    setBusyId(channelId);
    setError(null);
    try {
      await joinHuddleCall(channelId);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      close();
      nav.navigate("Channel", { channelId });
      nav.navigate("Huddle", { channelId });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t start the huddle");
    } finally {
      setBusyId(null);
    }
  }

  const bottom = 80 + Math.max(insets.bottom, 8);
  const targets = [...channels].sort(
    (a, b) => Number(Boolean(b.huddle?.active)) - Number(Boolean(a.huddle?.active)),
  );

  return (
    <>
      {shown ? (
        <View style={styles.overlay} pointerEvents="box-none">
          <Animated.View pointerEvents="none" style={[styles.scrim, { opacity: progress }]} />
          <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Dismiss" />
          <Animated.View
            onStartShouldSetResponder={() => true}
            style={[
              styles.cardWrap,
              {
                bottom,
                transform: [
                  {
                    translateY: progress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [28, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <Glass style={styles.card} variant="regular" fallback="light" colorScheme="light">
              {panel === "menu" ? (
                <View>
                  <ActionRow
                    tint="rgba(124, 58, 237, 0.16)"
                    icon={<Ionicons name="person-add" size={20} color="#7C3AED" />}
                    title="Invite members"
                    subtitle="Add team members to your workspace"
                    onPress={() => go(() => nav.navigate("Invites"))}
                  />
                  <ActionRow
                    tint="rgba(15, 157, 114, 0.16)"
                    icon={<IconHeadphones size={20} color="#0F9D72" />}
                    title="Huddle"
                    subtitle="Start an audio or video chat"
                    onPress={() => {
                      void Haptics.selectionAsync();
                      setError(null);
                      setPanel("huddle");
                    }}
                  />
                  <ActionRow
                    tint="rgba(224, 30, 90, 0.14)"
                    icon={<IconHash size={18} color="#E01E5A" />}
                    title="Channel"
                    subtitle="Organize teams and work"
                    onPress={() => go(() => nav.navigate("NewChannel"))}
                  />
                  <Pressable
                    style={styles.message}
                    onPress={() => go(() => nav.navigate("NewDm"))}
                    accessibilityRole="button"
                    accessibilityLabel="Message"
                  >
                    <Ionicons name="create-outline" size={18} color="#fff" />
                    <Text style={styles.messageTxt}>Message</Text>
                  </Pressable>
                </View>
              ) : (
                <View>
                  <View style={styles.huddleHead}>
                    <Pressable
                      onPress={() => {
                        setPanel("menu");
                        setError(null);
                      }}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel="Back"
                    >
                      <Ionicons name="chevron-back" size={22} color={colors.ink} />
                    </Pressable>
                    <Text style={styles.huddleTitle}>Start a huddle</Text>
                    <View style={{ width: 22 }} />
                  </View>
                  {error ? <Text style={styles.err}>{error}</Text> : null}
                  <ScrollView style={styles.huddleList} keyboardShouldPersistTaps="handled">
                    {targets.length ? (
                      targets.map((channel) => (
                        <HuddleRow
                          key={channel.id}
                          channel={channel}
                          busy={busyId === channel.id}
                          disabled={busyId !== null}
                          onPress={() => void joinHuddle(channel.id)}
                        />
                      ))
                    ) : (
                      <Text style={styles.empty}>Create a channel or message someone, then start a huddle there.</Text>
                    )}
                  </ScrollView>
                </View>
              )}
            </Glass>
          </Animated.View>
        </View>
      ) : null}
      {shown ? null : (
        <Pressable
          style={[styles.fab, { bottom }]}
          onPress={openMenu}
          accessibilityRole="button"
          accessibilityLabel="Create"
        >
          <IconPlus size={28} />
        </Pressable>
      )}
    </>
  );
}

function ActionRow({
  tint,
  icon,
  title,
  subtitle,
  onPress,
}: {
  tint: string;
  icon: ReactNode;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.row} onPress={onPress} accessibilityRole="button" accessibilityLabel={title}>
      <View style={[styles.ico, { backgroundColor: tint }]}>{icon}</View>
      <View style={styles.copy}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.sub}>{subtitle}</Text>
      </View>
    </Pressable>
  );
}

function HuddleRow({
  channel,
  busy,
  disabled,
  onPress,
}: {
  channel: Channel;
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const dm = channel.isDm || channel.isMpim;
  const name = dm ? (channel.dmName ?? channel.name) : channel.name;
  const live = Boolean(channel.huddle?.active);
  return (
    <Pressable style={styles.huddleRow} disabled={disabled} onPress={onPress} accessibilityRole="button">
      {dm ? (
        <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.muted} />
      ) : channel.isPrivate ? (
        <IconLock color={colors.muted} size={16} />
      ) : (
        <IconHash color={colors.muted} size={16} />
      )}
      <View style={{ flex: 1 }}>
        <Text style={styles.huddleName} numberOfLines={1}>
          {dm ? name : `#${name}`}
        </Text>
        <Text style={styles.sub}>{live ? "Live now" : "Start here"}</Text>
      </View>
      {busy ? <ActivityIndicator color={colors.aubergine} /> : live ? <View style={styles.live} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 30,
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.08)",
  },
  cardWrap: {
    position: "absolute",
    left: 16,
    right: 16,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 14 },
    elevation: 12,
  },
  card: {
    borderRadius: 28,
    paddingTop: 8,
    paddingBottom: 12,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 68,
  },
  ico: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  copy: { flex: 1, minWidth: 0 },
  title: { color: colors.ink, fontSize: 17, fontWeight: "700" },
  sub: { color: colors.muted, fontSize: 13, marginTop: 2 },
  message: {
    marginHorizontal: 14,
    marginTop: 6,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.aubergine,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  messageTxt: { color: "#fff", fontSize: 17, fontWeight: "700" },
  huddleHead: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingTop: 6,
    paddingBottom: 8,
  },
  huddleTitle: { flex: 1, textAlign: "center", color: colors.ink, fontSize: 17, fontWeight: "700" },
  huddleList: { maxHeight: 320 },
  huddleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 56,
  },
  huddleName: { color: colors.ink, fontSize: 16, fontWeight: "600" },
  live: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.green },
  empty: { color: colors.muted, fontSize: 14, paddingHorizontal: 16, paddingVertical: 12 },
  err: { color: colors.pink, fontSize: 13, paddingHorizontal: 16, paddingBottom: 4 },
  fab: {
    position: "absolute",
    right: 18,
    zIndex: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.fab,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
});

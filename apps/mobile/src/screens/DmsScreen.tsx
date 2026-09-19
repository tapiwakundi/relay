import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useWorkspace } from "../lib/workspace";
import { Avatar } from "../ui/Avatar";
import { Glass } from "../ui/Glass";
import { HeaderBtn, ScreenHeader } from "../ui/Header";
import { colors, radii, space } from "../ui/theme";
import type { RootStackParamList } from "../nav/types";

export function DmsScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { channels, members, me } = useWorkspace();
  const dms = channels.filter((c) => c.isDm);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <Glass style={styles.head}>
        <ScreenHeader title="Direct messages" right={<HeaderBtn label="+" onPress={() => nav.navigate("NewDm")} />} />
      </Glass>
      <ScrollView contentContainerStyle={{ padding: space.md, paddingBottom: 120 }}>
        <Glass style={styles.group}>
          {dms.map((c) => {
            const other = members.find((m) => c.dmName === m.displayName || c.dmName === m.name);
            return (
              <Pressable key={c.id} style={styles.row} onPress={() => nav.navigate("Channel", { channelId: c.id })}>
                <Avatar name={c.dmName ?? c.name} image={other?.image} presence={other?.presence} size={40} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, c.unreadCount ? styles.unread : null]}>{c.dmName ?? c.name}</Text>
                  <Text style={styles.sub}>{other?.statusText || other?.title || other?.presence || "teammate"}</Text>
                </View>
                {c.unreadCount ? (
                  <View style={styles.pill}>
                    <Text style={styles.pillTxt}>{c.unreadCount}</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
          {!dms.length ? <Text style={styles.empty}>No DMs yet. Start one with +</Text> : null}
        </Glass>
        <Text style={styles.sec}>People</Text>
        <Glass style={styles.group}>
          {members
            .filter((m) => m.userId !== me.id)
            .map((m) => (
              <Pressable key={m.userId} style={styles.row} onPress={() => nav.navigate("Profile", { userId: m.userId })}>
                <Avatar name={m.displayName} image={m.image} presence={m.presence} size={40} />
                <View>
                  <Text style={styles.name}>{m.displayName}</Text>
                  <Text style={styles.sub}>{m.title || m.email}</Text>
                </View>
              </Pressable>
            ))}
        </Glass>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  head: { marginHorizontal: 12, borderRadius: radii.lg },
  group: { borderRadius: radii.lg, overflow: "hidden" },
  sec: {
    color: colors.muted,
    fontWeight: "800",
    textTransform: "uppercase",
    fontSize: 12,
    marginTop: 18,
    marginBottom: 8,
    letterSpacing: 0.6,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12 },
  name: { color: colors.ink, fontSize: 16, fontWeight: "700" },
  unread: { fontWeight: "900" },
  sub: { color: colors.muted, fontSize: 13, marginTop: 2 },
  empty: { color: colors.muted, padding: 16 },
  pill: {
    backgroundColor: colors.unread,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  pillTxt: { color: "#fff", fontSize: 12, fontWeight: "800" },
});

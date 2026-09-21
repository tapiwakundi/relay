import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import type { Channel, Member, SearchHit } from "@relay/shared";
import { api } from "../lib/auth";
import { keys } from "../lib/query";
import { useWorkspace } from "../lib/workspace";
import { Avatar } from "../ui/Avatar";
import { Glass, GlassGroup } from "../ui/Glass";
import { IconHash, IconLock, IconSearch } from "../ui/Icons";
import { colors } from "../ui/theme";
import type { RootStackParamList } from "../nav/types";

type Props = NativeStackScreenProps<RootStackParamList, "Search">;

export function SearchScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { workspace, me, channels, members } = useWorkspace();
  const [q, setQ] = useState("");
  const [keyboard, setKeyboard] = useState(0);
  const query = q.trim();
  const results = useQuery({
    queryKey: keys.search(workspace.id, query),
    enabled: query.length > 1,
    queryFn: () => api<{ hits: SearchHit[] }>(`/api/search?q=${encodeURIComponent(query)}`),
  });

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

  const places = useMemo(() => browseRows(channels, members, me.id), [channels, members, me.id]);
  const hits = query.length > 1 ? results.data?.hits : undefined;

  function openHit(hit: SearchHit) {
    if (hit.kind === "member" && hit.userId) {
      navigation.navigate("Profile", { userId: hit.userId });
      return;
    }
    const channelId = hit.channelId ?? (hit.kind === "channel" ? hit.id : null);
    if (channelId) navigation.navigate("Channel", { channelId });
  }

  function openPlace(row: Place) {
    if (row.userId) navigation.navigate("Profile", { userId: row.userId });
    else if (row.channelId) navigation.navigate("Channel", { channelId: row.channelId });
  }

  const barBottom = keyboard > 0 ? keyboard + 8 : Math.max(insets.bottom, 8);

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <Text style={styles.headerTitle}>Search</Text>
        <Pressable
          onPress={() => navigation.navigate("EditProfile")}
          accessibilityRole="button"
          accessibilityLabel="Your profile"
          style={styles.me}
        >
          <Avatar name={me.displayName} image={me.image} size={36} round />
        </Pressable>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.list, { paddingBottom: barBottom + 56 }]}
      >
        {hits ? (
          hits.length ? (
            hits.map((hit) => (
              <Pressable key={`${hit.kind}-${hit.id}`} style={styles.row} onPress={() => openHit(hit)}>
                <HitIcon hit={hit} members={members} />
                <Text style={styles.name} numberOfLines={1}>
                  {hit.title}
                  {hit.snippet ? <Text style={styles.snip}>  {hit.snippet}</Text> : null}
                </Text>
              </Pressable>
            ))
          ) : (
            <Text style={styles.empty}>No matches</Text>
          )
        ) : (
          <>
            <Text style={styles.section}>Channels and people</Text>
            {places.map((row) => (
              <Pressable key={row.key} style={styles.row} onPress={() => openPlace(row)}>
                {row.icon}
                <Text style={styles.name} numberOfLines={1}>
                  {row.title}
                </Text>
              </Pressable>
            ))}
          </>
        )}
      </ScrollView>

      <View style={[styles.bar, { bottom: barBottom }]} pointerEvents="box-none">
        <GlassGroup style={styles.barRow} spacing={8}>
          <Glass style={styles.field} variant="clear" fallback="light" colorScheme="light" interactive>
            <View style={styles.fieldInner}>
              <IconSearch color={colors.muted} size={18} />
              <TextInput
                style={styles.input}
                placeholder="Search"
                placeholderTextColor={colors.faint}
                value={q}
                onChangeText={setQ}
                autoFocus
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
                clearButtonMode="never"
              />
            </View>
          </Glass>
          <Glass style={styles.clear} variant="clear" fallback="light" colorScheme="light" interactive>
            <Pressable
              style={styles.clearHit}
              accessibilityRole="button"
              accessibilityLabel={q ? "Clear search" : "Close search"}
              onPress={() => {
                if (q) setQ("");
                else navigation.goBack();
              }}
            >
              <Ionicons name="close" size={18} color={colors.ink} />
            </Pressable>
          </Glass>
        </GlassGroup>
      </View>
    </View>
  );
}

function HitIcon({ hit, members }: { hit: SearchHit; members: Member[] }) {
  if (hit.kind === "channel" && hit.title.startsWith("#")) {
    return (
      <View style={styles.ico}>
        <IconHash color={colors.ink} size={18} />
      </View>
    );
  }
  const person = members.find((m) => m.userId === hit.userId || m.displayName === hit.title);
  return <Avatar name={hit.title.replace(/^#/, "")} image={person?.image} size={32} round />;
}

type Place = {
  key: string;
  title: string;
  icon: ReactNode;
  channelId?: string;
  userId?: string;
};

function browseRows(channels: Channel[], members: Member[], meId: string): Place[] {
  const rows: Place[] = [];
  for (const channel of channels) {
    if (channel.isDm || channel.isMpim) {
      const name = channel.dmName ?? channel.name;
      const peer = members.find((m) => m.userId !== meId && (m.displayName === name || m.name === name));
      rows.push({
        key: channel.id,
        title: name,
        channelId: channel.id,
        icon: <Avatar name={name} image={peer?.image} size={32} round />,
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
  root: { flex: 1, backgroundColor: colors.canvas },
  header: {
    backgroundColor: colors.hero,
    paddingHorizontal: 16,
    paddingBottom: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerTitle: {
    flex: 1,
    color: colors.headerInk,
    fontSize: 34,
    fontWeight: "800",
    letterSpacing: -0.6,
  },
  me: {
    borderRadius: 20,
    borderWidth: 2,
    borderColor: "#fff",
  },
  list: { paddingTop: 8, paddingBottom: 12 },
  section: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "800",
    marginTop: 14,
    marginBottom: 6,
    marginHorizontal: 16,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    minHeight: 48,
  },
  ico: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  name: { flex: 1, color: colors.ink, fontSize: 17, fontWeight: "600" },
  snip: { color: colors.muted, fontWeight: "400" },
  empty: { color: colors.muted, fontSize: 16, padding: 16 },
  bar: {
    position: "absolute",
    left: 12,
    right: 12,
  },
  barRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  field: {
    flex: 1,
    height: 44,
    borderRadius: 22,
  },
  fieldInner: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    gap: 8,
  },
  input: { flex: 1, color: colors.ink, fontSize: 17, paddingVertical: 0 },
  clear: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  clearHit: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});

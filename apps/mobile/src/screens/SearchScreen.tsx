import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { SearchHit } from "@relay/shared";
import { api } from "../lib/auth";
import { keys } from "../lib/query";
import { Glass } from "../ui/Glass";
import { HeaderBtn, ScreenHeader } from "../ui/Header";
import { colors, radii, space } from "../ui/theme";
import type { RootStackParamList } from "../nav/types";

type Props = NativeStackScreenProps<RootStackParamList, "Search">;

export function SearchScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState("");
  const results = useQuery({
    queryKey: keys.search(q),
    enabled: q.trim().length > 1,
    queryFn: () => api<{ hits: SearchHit[] }>(`/api/search?q=${encodeURIComponent(q.trim())}`),
  });

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <Glass style={styles.head}>
        <ScreenHeader title="Search" left={<HeaderBtn label="‹" onPress={() => navigation.goBack()} />} />
        <TextInput
          style={styles.input}
          placeholder="Search messages, people, channels"
          placeholderTextColor={colors.faint}
          value={q}
          onChangeText={setQ}
          autoFocus
        />
      </Glass>
      <ScrollView contentContainerStyle={{ padding: space.md, gap: 8 }}>
        {(results.data?.hits ?? []).map((hit) => (
          <Pressable
            key={`${hit.kind}-${hit.id}`}
            onPress={() => {
              if (hit.kind === "channel" || hit.channelId) {
                navigation.navigate("Channel", { channelId: hit.channelId ?? hit.id });
              } else if (hit.userId) {
                navigation.navigate("Profile", { userId: hit.userId });
              }
            }}
          >
            <Glass style={styles.card}>
              <Text style={styles.kind}>{hit.kind}</Text>
              <Text style={styles.title}>{hit.title}</Text>
              {hit.snippet ? <Text style={styles.snip}>{hit.snippet}</Text> : null}
            </Glass>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  head: { marginHorizontal: 12, borderRadius: radii.lg, paddingBottom: 10 },
  input: {
    marginHorizontal: 12,
    height: 44,
    borderRadius: radii.sm,
    paddingHorizontal: 12,
    color: colors.ink,
    backgroundColor: "rgba(0,0,0,0.22)",
    fontSize: 16,
  },
  card: { padding: 14, borderRadius: radii.md },
  kind: { color: colors.muted, fontSize: 11, fontWeight: "800", textTransform: "uppercase" },
  title: { color: colors.ink, fontWeight: "800", fontSize: 16 },
  snip: { color: colors.muted, marginTop: 4 },
});

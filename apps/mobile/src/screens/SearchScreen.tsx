import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import type { SearchHit } from "@relay/shared";
import { api } from "../lib/auth";
import { keys } from "../lib/query";
import { useWorkspace } from "../lib/workspace";
import { HeaderBtn } from "../ui/Header";
import { PageHeader, ScreenCanvas } from "../ui/SlackChrome";
import { colors, radii, space } from "../ui/theme";
import type { RootStackParamList } from "../nav/types";

type Props = NativeStackScreenProps<RootStackParamList, "Search">;

export function SearchScreen({ navigation }: Props) {
  const { workspace } = useWorkspace();
  const [q, setQ] = useState("");
  const results = useQuery({
    queryKey: keys.search(workspace.id, q),
    enabled: q.trim().length > 1,
    queryFn: () => api<{ hits: SearchHit[] }>(`/api/search?q=${encodeURIComponent(q.trim())}`),
  });

  return (
    <ScreenCanvas>
      <PageHeader title="Search" left={<HeaderBtn label="‹" onPress={() => navigation.goBack()} />} />
      <View style={{ paddingHorizontal: 16, paddingBottom: 10 }}>
        <TextInput
          style={styles.input}
          placeholder="Search messages, people, channels"
          placeholderTextColor={colors.faint}
          value={q}
          onChangeText={setQ}
          autoFocus
        />
      </View>
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
            <View style={styles.card}>
              <Text style={styles.kind}>{hit.kind}</Text>
              <Text style={styles.title}>{hit.title}</Text>
              {hit.snippet ? <Text style={styles.snip}>{hit.snippet}</Text> : null}
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </ScreenCanvas>
  );
}

const styles = StyleSheet.create({
  input: {
    height: 44,
    borderRadius: radii.sm,
    paddingHorizontal: 12,
    color: colors.ink,
    backgroundColor: colors.inputFill,
    fontSize: 16,
  },
  card: { padding: 14, borderRadius: radii.md, borderWidth: 1, borderColor: colors.hairline },
  kind: { color: colors.muted, fontSize: 11, fontWeight: "800", textTransform: "uppercase" },
  title: { color: colors.ink, fontWeight: "800", fontSize: 16 },
  snip: { color: colors.muted, marginTop: 4 },
});

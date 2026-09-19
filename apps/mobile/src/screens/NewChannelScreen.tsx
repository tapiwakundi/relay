import { useState } from "react";
import { StyleSheet, Switch, Text, TextInput, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../lib/auth";
import { keys, queryClient } from "../lib/query";
import { useWorkspace } from "../lib/workspace";
import { Glass } from "../ui/Glass";
import { HeaderBtn, ScreenHeader } from "../ui/Header";
import { colors, radii, space } from "../ui/theme";
import type { RootStackParamList } from "../nav/types";

type Props = NativeStackScreenProps<RootStackParamList, "NewChannel">;

export function NewChannelScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { workspace } = useWorkspace();
  const [name, setName] = useState("");
  const [topic, setTopic] = useState("");
  const [isPrivate, setPrivate] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setError(null);
    try {
      const { channel } = await api<{ channel: { id: string } }>("/api/channels", {
        method: "POST",
        body: JSON.stringify({ name, topic, isPrivate, workspaceId: workspace.id }),
      });
      await queryClient.invalidateQueries({ queryKey: keys.bootstrap(workspace.id) });
      navigation.replace("Channel", { channelId: channel.id });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <Glass style={styles.head}>
        <ScreenHeader
          title="New channel"
          left={<HeaderBtn label="‹" onPress={() => navigation.goBack()} />}
          right={<HeaderBtn label="Create" onPress={() => void create()} />}
        />
      </Glass>
      <Glass style={styles.card}>
        {error ? <Text style={styles.err}>{error}</Text> : null}
        <TextInput
          style={styles.input}
          placeholder="channel-name"
          autoCapitalize="none"
          placeholderTextColor={colors.faint}
          value={name}
          onChangeText={setName}
        />
        <TextInput
          style={styles.input}
          placeholder="Topic (optional)"
          placeholderTextColor={colors.faint}
          value={topic}
          onChangeText={setTopic}
        />
        <View style={styles.row}>
          <Text style={styles.label}>Private</Text>
          <Switch value={isPrivate} onValueChange={setPrivate} />
        </View>
      </Glass>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  head: { marginHorizontal: 12, borderRadius: radii.lg },
  card: { margin: space.md, padding: space.lg, borderRadius: radii.lg, gap: 12 },
  err: { color: colors.pink },
  input: {
    height: 48,
    borderRadius: radii.sm,
    paddingHorizontal: 12,
    color: colors.ink,
    backgroundColor: "rgba(0,0,0,0.22)",
    fontSize: 16,
  },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  label: { color: colors.ink, fontWeight: "700" },
});

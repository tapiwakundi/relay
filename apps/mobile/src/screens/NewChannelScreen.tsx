import { useState } from "react";
import { StyleSheet, Switch, Text, TextInput, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { api } from "../lib/auth";
import { keys, queryClient } from "../lib/query";
import { useWorkspace } from "../lib/workspace";
import { HeaderBtn } from "../ui/Header";
import { PageHeader, ScreenCanvas } from "../ui/SlackChrome";
import { colors, radii, space } from "../ui/theme";
import type { RootStackParamList } from "../nav/types";

type Props = NativeStackScreenProps<RootStackParamList, "NewChannel">;

export function NewChannelScreen({ navigation }: Props) {
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
    <ScreenCanvas>
      <PageHeader
        title="New channel"
        left={<HeaderBtn label="‹" onPress={() => navigation.goBack()} />}
        right={<HeaderBtn label="Create" onPress={() => void create()} />}
      />
      <View style={styles.card}>
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
      </View>
    </ScreenCanvas>
  );
}

const styles = StyleSheet.create({
  card: { margin: space.md, padding: space.lg, borderRadius: radii.lg, gap: 12 },
  err: { color: colors.pink },
  input: {
    height: 48,
    borderRadius: radii.sm,
    paddingHorizontal: 12,
    color: colors.ink,
    backgroundColor: colors.inputFill,
    fontSize: 16,
  },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  label: { color: colors.ink, fontWeight: "700" },
});

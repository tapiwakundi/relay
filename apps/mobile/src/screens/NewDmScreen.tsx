import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { api } from "../lib/auth";
import { useWorkspace } from "../lib/workspace";
import { Avatar } from "../ui/Avatar";
import { HeaderBtn } from "../ui/Header";
import { PageHeader, ScreenCanvas } from "../ui/SlackChrome";
import { colors, space } from "../ui/theme";
import type { RootStackParamList } from "../nav/types";

type Props = NativeStackScreenProps<RootStackParamList, "NewDm">;

export function NewDmScreen({ navigation }: Props) {
  const { members, me, workspace } = useWorkspace();

  async function open(userId: string) {
    const { channel } = await api<{ channel: { id: string } }>("/api/dms", {
      method: "POST",
      body: JSON.stringify({ userId, workspaceId: workspace.id }),
    });
    navigation.replace("Channel", { channelId: channel.id });
  }

  return (
    <ScreenCanvas>
      <PageHeader title="New message" left={<HeaderBtn label="‹" onPress={() => navigation.goBack()} />} />
      <ScrollView contentContainerStyle={{ padding: space.md }}>
        {members
          .filter((m) => m.userId !== me.id)
          .map((m) => (
            <Pressable key={m.userId} style={styles.row} onPress={() => void open(m.userId)}>
              <Avatar name={m.displayName} image={m.image} presence={m.presence} size={40} />
              <View>
                <Text style={styles.name}>{m.displayName}</Text>
                <Text style={styles.sub}>{m.title || m.email}</Text>
              </View>
            </Pressable>
          ))}
      </ScrollView>
    </ScreenCanvas>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  name: { color: colors.ink, fontWeight: "800", fontSize: 16 },
  sub: { color: colors.muted },
});

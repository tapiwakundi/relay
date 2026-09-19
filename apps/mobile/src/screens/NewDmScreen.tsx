import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../lib/auth";
import { useWorkspace } from "../lib/workspace";
import { Avatar } from "../ui/Avatar";
import { Glass } from "../ui/Glass";
import { HeaderBtn, ScreenHeader } from "../ui/Header";
import { colors, radii, space } from "../ui/theme";
import type { RootStackParamList } from "../nav/types";

type Props = NativeStackScreenProps<RootStackParamList, "NewDm">;

export function NewDmScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { members, me, workspace } = useWorkspace();

  async function open(userId: string) {
    const { channel } = await api<{ channel: { id: string } }>("/api/dms", {
      method: "POST",
      body: JSON.stringify({ userId, workspaceId: workspace.id }),
    });
    navigation.replace("Channel", { channelId: channel.id });
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <Glass style={styles.head}>
        <ScreenHeader title="New message" left={<HeaderBtn label="‹" onPress={() => navigation.goBack()} />} />
      </Glass>
      <ScrollView contentContainerStyle={{ padding: space.md }}>
        <Glass style={styles.group}>
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
        </Glass>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  head: { marginHorizontal: 12, borderRadius: radii.lg },
  group: { borderRadius: radii.lg, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12 },
  name: { color: colors.ink, fontWeight: "800", fontSize: 16 },
  sub: { color: colors.muted },
});

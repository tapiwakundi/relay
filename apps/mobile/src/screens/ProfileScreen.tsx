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

type Props = NativeStackScreenProps<RootStackParamList, "Profile">;

export function ProfileScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { members, workspace, me } = useWorkspace();
  const member = members.find((m) => m.userId === route.params.userId);
  if (!member) return null;

  async function message() {
    const { channel } = await api<{ channel: { id: string } }>("/api/dms", {
      method: "POST",
      body: JSON.stringify({ userId: member!.userId, workspaceId: workspace.id }),
    });
    navigation.navigate("Channel", { channelId: channel.id });
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <Glass style={styles.head}>
        <ScreenHeader title="Profile" left={<HeaderBtn label="‹" onPress={() => navigation.goBack()} />} />
      </Glass>
      <ScrollView contentContainerStyle={{ padding: space.md, paddingBottom: 40 }}>
        <Glass style={styles.card}>
          <Avatar name={member.displayName} image={member.image} size={96} presence={member.presence} />
          <Text style={styles.name}>
            {member.statusEmoji ? `${member.statusEmoji} ` : ""}
            {member.displayName}
          </Text>
          {member.title ? <Text style={styles.title}>{member.title}</Text> : null}
          <Text style={styles.meta}>{member.email}</Text>
          <Text style={styles.meta}>
            {member.presence}
            {member.statusText ? ` · ${member.statusText}` : ""}
          </Text>
          {member.userId !== me.id ? (
            <Pressable style={styles.msg} onPress={() => void message()}>
              <Text style={styles.msgTxt}>Message</Text>
            </Pressable>
          ) : (
            <Pressable style={styles.msg} onPress={() => navigation.navigate("EditProfile")}>
              <Text style={styles.msgTxt}>Edit profile</Text>
            </Pressable>
          )}
        </Glass>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  head: { marginHorizontal: 12, borderRadius: radii.lg },
  card: { padding: 24, alignItems: "center", borderRadius: radii.lg, gap: 6 },
  name: { color: colors.ink, fontSize: 28, fontWeight: "800", marginTop: 12, textAlign: "center" },
  title: { color: colors.ink, fontSize: 16 },
  meta: { color: colors.muted },
  msg: {
    marginTop: 16,
    backgroundColor: colors.green,
    borderRadius: radii.pill,
    paddingHorizontal: 22,
    paddingVertical: 12,
  },
  msgTxt: { color: "#fff", fontWeight: "800" },
});

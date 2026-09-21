import { useState } from "react";
import { Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import type { Invite } from "@relay/shared";
import { api } from "../lib/auth";
import { keys } from "../lib/query";
import { useWorkspace } from "../lib/workspace";
import { HeaderBtn } from "../ui/Header";
import { PageHeader, ScreenCanvas } from "../ui/SlackChrome";
import { colors, radii, space } from "../ui/theme";
import type { RootStackParamList } from "../nav/types";

type Props = NativeStackScreenProps<RootStackParamList, "Invites">;

export function InvitesScreen({ navigation }: Props) {
  const { workspace } = useWorkspace();
  const [email, setEmail] = useState("");
  const q = useQuery({
    queryKey: keys.invites(workspace.id),
    queryFn: () => api<{ invites: Invite[] }>("/api/invites"),
  });

  async function create() {
    await api("/api/invites", { method: "POST", body: JSON.stringify({ email, workspaceId: workspace.id }) });
    setEmail("");
    await q.refetch();
  }

  return (
    <ScreenCanvas>
      <PageHeader title="Invites" left={<HeaderBtn label="‹" onPress={() => navigation.goBack()} />} />
      <ScrollView contentContainerStyle={{ padding: space.md, gap: 12 }}>
        <View style={styles.card}>
          <Text style={styles.label}>Invite by email</Text>
          <Text style={styles.meta}>They’ll see this invite after they create a Relay account with this email.</Text>
          <TextInput
            style={styles.input}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="teammate@company.com"
            placeholderTextColor={colors.faint}
            value={email}
            onChangeText={setEmail}
          />
          <Pressable style={styles.cta} onPress={() => void create()}>
            <Text style={styles.ctaTxt}>Send invite</Text>
          </Pressable>
        </View>
        {(q.data?.invites ?? []).map((inv) => (
          <Pressable key={inv.id} onPress={() => void Share.share({ message: inv.url, url: inv.url })}>
            <View style={styles.card}>
              <Text style={styles.name}>{inv.email}</Text>
              <Text style={styles.meta}>{inv.status} · tap to share link</Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </ScreenCanvas>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    borderRadius: radii.lg,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  label: { color: colors.muted, fontWeight: "700" },
  input: {
    height: 48,
    borderRadius: radii.sm,
    paddingHorizontal: 12,
    color: colors.ink,
    backgroundColor: colors.inputFill,
    fontSize: 16,
  },
  cta: { backgroundColor: colors.green, borderRadius: radii.sm, alignItems: "center", paddingVertical: 12 },
  ctaTxt: { color: "#fff", fontWeight: "800" },
  name: { color: colors.ink, fontWeight: "800" },
  meta: { color: colors.muted },
});

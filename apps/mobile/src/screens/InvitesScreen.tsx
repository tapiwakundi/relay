import { useState } from "react";
import { Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Invite } from "@relay/shared";
import { api } from "../lib/auth";
import { keys } from "../lib/query";
import { useWorkspace } from "../lib/workspace";
import { Glass } from "../ui/Glass";
import { HeaderBtn, ScreenHeader } from "../ui/Header";
import { colors, radii, space } from "../ui/theme";
import type { RootStackParamList } from "../nav/types";

type Props = NativeStackScreenProps<RootStackParamList, "Invites">;

export function InvitesScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { workspace } = useWorkspace();
  const [email, setEmail] = useState("");
  const q = useQuery({
    queryKey: keys.invites,
    queryFn: () => api<{ invites: Invite[] }>("/api/invites"),
  });

  async function create() {
    await api("/api/invites", { method: "POST", body: JSON.stringify({ email, workspaceId: workspace.id }) });
    setEmail("");
    await q.refetch();
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <Glass style={styles.head}>
        <ScreenHeader title="Invites" left={<HeaderBtn label="‹" onPress={() => navigation.goBack()} />} />
      </Glass>
      <ScrollView contentContainerStyle={{ padding: space.md, gap: 12 }}>
        <Glass style={styles.card}>
          <Text style={styles.label}>Invite by email</Text>
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
        </Glass>
        {(q.data?.invites ?? []).map((inv) => (
          <Pressable
            key={inv.id}
            onPress={() => void Share.share({ message: inv.url, url: inv.url })}
          >
            <Glass style={styles.card}>
              <Text style={styles.name}>{inv.email}</Text>
              <Text style={styles.meta}>{inv.status} · tap to share link</Text>
            </Glass>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  head: { marginHorizontal: 12, borderRadius: radii.lg },
  card: { padding: 16, borderRadius: radii.lg, gap: 8 },
  label: { color: colors.muted, fontWeight: "700" },
  input: {
    height: 48,
    borderRadius: radii.sm,
    paddingHorizontal: 12,
    color: colors.ink,
    backgroundColor: "rgba(0,0,0,0.22)",
    fontSize: 16,
  },
  cta: { backgroundColor: colors.green, borderRadius: radii.sm, alignItems: "center", paddingVertical: 12 },
  ctaTxt: { color: "#fff", fontWeight: "800" },
  name: { color: colors.ink, fontWeight: "800" },
  meta: { color: colors.muted },
});

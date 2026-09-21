import { useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { InboxInvite } from "@relay/shared";
import { useAccounts } from "../lib/account-manager";
import { api } from "../lib/auth";
import { keys, queryClient } from "../lib/query";
import { colors, radii } from "../ui/theme";

const logo = require("../../assets/icon.png");

export function AcceptInviteScreen({
  pendingInvites,
  onCreated,
  onCreateWorkspace,
}: {
  pendingInvites: InboxInvite[];
  onCreated: () => void;
  onCreateWorkspace: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { removeAccount, startAddAccount } = useAccounts();
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const busy = pendingId !== null;
  const single = pendingInvites.length === 1 ? pendingInvites[0] : null;

  async function accept(inviteId: string) {
    setPendingId(inviteId);
    setError(null);
    try {
      await api("/api/invites/accept", { method: "POST", body: JSON.stringify({ inviteId }) });
      await queryClient.invalidateQueries({ queryKey: keys.me });
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPendingId(null);
    }
  }

  const title = single ? `Join ${single.workspace.name}` : "You've been invited";
  const sub = single
    ? single.invitedByName
      ? `${single.invitedByName} invited you to this workspace.`
      : "Accept this invite to join the team."
    : "Accept an invite to join a team.";

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            styles.scroll,
            { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 24 },
          ]}
        >
          <View style={styles.brand}>
            <Image source={logo} style={styles.mark} />
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.sub}>{sub}</Text>
          </View>

          {error ? <Text style={styles.err}>{error}</Text> : null}

          {pendingInvites.map((item) => (
            <View key={item.id} style={styles.invite}>
              <View style={[styles.wsIco, { backgroundColor: item.workspace.iconColor }]}>
                <Text style={styles.wsIcoTxt}>
                  {(item.workspace.iconLetter || item.workspace.name[0] || "W").toUpperCase()}
                </Text>
              </View>
              <View style={styles.inviteMeta}>
                <Text style={styles.inviteName}>{item.workspace.name}</Text>
                <Text style={styles.inviteWho}>
                  {item.invitedByName ? `Invited by ${item.invitedByName}` : "Pending invite"}
                </Text>
              </View>
            </View>
          ))}

          {single ? (
            <Pressable
              style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed, busy && styles.disabled]}
              onPress={() => void accept(single.id)}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color={colors.canvas} />
              ) : (
                <Text style={styles.ctaTxt}>Accept invitation</Text>
              )}
            </Pressable>
          ) : (
            pendingInvites.map((item) => (
              <Pressable
                key={`accept-${item.id}`}
                style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed, busy && styles.disabled]}
                onPress={() => void accept(item.id)}
                disabled={busy}
              >
                {pendingId === item.id ? (
                  <ActivityIndicator color={colors.canvas} />
                ) : (
                  <Text style={styles.ctaTxt}>Accept {item.workspace.name}</Text>
                )}
              </Pressable>
            ))
          )}

          <Pressable hitSlop={8} disabled={busy} onPress={onCreateWorkspace} style={styles.switch}>
            <Text style={styles.switchTxt}>
              or <Text style={styles.switchLink}>create a workspace</Text>
            </Text>
          </Pressable>

          <Pressable hitSlop={8} disabled={busy} onPress={() => startAddAccount()} style={styles.alt}>
            <Text style={styles.altTxt}>Sign in with another account</Text>
          </Pressable>
          <Pressable hitSlop={8} disabled={busy} onPress={() => void removeAccount()}>
            <Text style={styles.altTxt}>Sign out</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  brand: { alignItems: "center", marginBottom: 36 },
  mark: { width: 56, height: 56, borderRadius: 14, marginBottom: 20 },
  title: {
    color: colors.ink,
    fontSize: 28,
    fontWeight: "600",
    letterSpacing: -0.6,
    textAlign: "center",
  },
  sub: { marginTop: 8, color: colors.muted, fontSize: 15, textAlign: "center" },
  err: {
    color: colors.pink,
    fontSize: 14,
    textAlign: "center",
    marginBottom: 16,
  },
  invite: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 64,
    paddingHorizontal: 14,
    marginBottom: 10,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.tileBorder,
    backgroundColor: colors.canvas,
  },
  wsIco: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  wsIcoTxt: { color: "#fff", fontWeight: "700", fontSize: 15 },
  inviteMeta: { flex: 1, minWidth: 0 },
  inviteName: { color: colors.ink, fontWeight: "600", fontSize: 16 },
  inviteWho: { marginTop: 2, color: colors.muted, fontSize: 13 },
  cta: {
    height: 52,
    marginTop: 6,
    borderRadius: radii.md,
    backgroundColor: colors.aubergine,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaPressed: { backgroundColor: colors.aubergineDeep },
  disabled: { opacity: 0.7 },
  ctaTxt: { color: colors.canvas, fontWeight: "600", fontSize: 16 },
  switch: { marginTop: 22, alignItems: "center" },
  switchTxt: { color: colors.muted, fontSize: 15, textAlign: "center" },
  switchLink: { color: colors.accent, fontWeight: "600" },
  alt: { marginTop: 18, alignItems: "center" },
  altTxt: { color: colors.faint, fontSize: 14, textAlign: "center" },
});

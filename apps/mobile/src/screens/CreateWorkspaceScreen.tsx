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
  TextInput,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAccounts } from "../lib/account-manager";
import { api } from "../lib/auth";
import { queryClient, keys } from "../lib/query";
import { colors, radii } from "../ui/theme";

const logo = require("../../assets/icon.png");

function inviteToken(raw: string) {
  const value = raw.trim();
  if (!value.includes("invite=")) return value;
  return value.split("invite=")[1]?.split("&")[0] ?? value;
}

export function CreateWorkspaceScreen({
  onCreated,
  onBackToInvites,
}: {
  onCreated: () => void;
  onBackToInvites?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { removeAccount, startAddAccount } = useAccounts();
  const [name, setName] = useState("");
  const [invite, setInvite] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<"create" | "join" | null>(null);
  const busy = pending !== null;

  async function create() {
    setPending("create");
    setError(null);
    try {
      await api("/api/workspaces", { method: "POST", body: JSON.stringify({ name: name.trim() }) });
      await queryClient.invalidateQueries({ queryKey: keys.me });
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(null);
    }
  }

  async function acceptToken() {
    const token = inviteToken(invite);
    if (!token) {
      setError("Paste an invite link or token");
      return;
    }
    setPending("join");
    setError(null);
    try {
      await api("/api/invites/accept", { method: "POST", body: JSON.stringify({ token }) });
      await queryClient.invalidateQueries({ queryKey: keys.me });
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(null);
    }
  }

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
            <Text style={styles.title}>Create a workspace</Text>
            <Text style={styles.sub}>Name your team to get started.</Text>
          </View>

          {error ? <Text style={styles.err}>{error}</Text> : null}

          <TextInput
            style={styles.input}
            placeholder="Workspace name"
            placeholderTextColor={colors.faint}
            value={name}
            onChangeText={setName}
            editable={!busy}
            autoFocus={!onBackToInvites}
          />

          <Pressable
            style={({ pressed }) => [
              styles.cta,
              pressed && styles.ctaPressed,
              (busy || !name.trim()) && styles.disabled,
            ]}
            onPress={() => void create()}
            disabled={busy || !name.trim()}
          >
            {pending === "create" ? (
              <ActivityIndicator color={colors.canvas} />
            ) : (
              <Text style={styles.ctaTxt}>Create workspace</Text>
            )}
          </Pressable>

          {onBackToInvites ? (
            <Pressable hitSlop={8} disabled={busy} onPress={onBackToInvites} style={styles.switch}>
              <Text style={styles.switchTxt}>
                or <Text style={styles.switchLink}>accept an invitation</Text>
              </Text>
            </Pressable>
          ) : (
            <>
              <View style={styles.or}>
                <View style={styles.orLine} />
                <Text style={styles.orTxt}>or</Text>
                <View style={styles.orLine} />
              </View>
              <TextInput
                style={styles.input}
                placeholder="Paste invite link"
                placeholderTextColor={colors.faint}
                value={invite}
                onChangeText={setInvite}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!busy}
              />
              <Pressable
                style={({ pressed }) => [
                  styles.altBtn,
                  pressed && styles.altPressed,
                  (busy || !invite.trim()) && styles.disabled,
                ]}
                onPress={() => void acceptToken()}
                disabled={busy || !invite.trim()}
              >
                {pending === "join" ? (
                  <ActivityIndicator color={colors.ink} />
                ) : (
                  <Text style={styles.altBtnTxt}>Join with invite</Text>
                )}
              </Pressable>
            </>
          )}

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
  input: {
    height: 52,
    borderRadius: radii.md,
    paddingHorizontal: 16,
    marginBottom: 10,
    color: colors.ink,
    backgroundColor: colors.inputFill,
    fontSize: 16,
  },
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
  or: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginVertical: 22,
  },
  orLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.hairline },
  orTxt: { color: colors.faint, fontSize: 13, fontWeight: "500" },
  altBtn: {
    height: 52,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.tileBorder,
    backgroundColor: colors.canvas,
    alignItems: "center",
    justifyContent: "center",
  },
  altPressed: { backgroundColor: colors.inputFill },
  altBtnTxt: { color: colors.ink, fontWeight: "600", fontSize: 16 },
  switch: { marginTop: 22, alignItems: "center" },
  switchTxt: { color: colors.muted, fontSize: 15, textAlign: "center" },
  switchLink: { color: colors.accent, fontWeight: "600" },
  alt: { marginTop: 18, alignItems: "center" },
  altTxt: { color: colors.faint, fontSize: 14, textAlign: "center" },
});

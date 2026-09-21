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
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { signInEmail, signInGoogle, signUpEmail } from "../lib/auth";
import { useAccounts } from "../lib/account-manager";
import { colors, radii } from "../ui/theme";

const logo = require("../../assets/icon.png");

type Mode = "in" | "up";
type Pending = "google" | "email" | null;

export function LoginScreen({
  add,
  onCancel,
}: {
  add?: boolean;
  onCancel?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { completeAuth } = useAccounts();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [mode, setMode] = useState<Mode>("in");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending>(null);

  const busy = pending !== null;
  const title = add ? "Add account" : mode === "in" ? "Sign in" : "Create account";

  async function finish() {
    await completeAuth();
  }

  async function emailAuth() {
    setPending("email");
    setError(null);
    try {
      const result =
        mode === "in"
          ? await signInEmail(email, password)
          : await signUpEmail(name.trim() || email.split("@")[0], email, password);
      if (result.error) throw new Error(result.error.message ?? "Auth failed");
      await finish();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(null);
    }
  }

  async function google() {
    setPending("google");
    setError(null);
    try {
      const result = await signInGoogle();
      if (result.error) throw new Error(result.error.message ?? "Google sign-in failed");
      await finish();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(null);
    }
  }

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            styles.scroll,
            {
              paddingTop: insets.top + (add ? 8 : 48),
              paddingBottom: insets.bottom + 24,
            },
          ]}
        >
          {add ? (
            <Pressable hitSlop={12} onPress={onCancel} style={styles.cancel} disabled={busy}>
              <Text style={styles.cancelTxt}>Cancel</Text>
            </Pressable>
          ) : null}

          <View style={styles.brand}>
            <Image source={logo} style={styles.mark} />
            <Text style={styles.title}>{title}</Text>
            {add ? <Text style={styles.sub}>Your current account stays signed in.</Text> : null}
          </View>

          {error ? <Text style={styles.err}>{error}</Text> : null}

          <Pressable
            style={({ pressed }) => [styles.google, pressed && styles.pressed]}
            onPress={() => void google()}
            disabled={busy}
          >
            {pending === "google" ? (
              <ActivityIndicator color={colors.ink} />
            ) : (
              <>
                <Ionicons name="logo-google" size={18} color={colors.ink} />
                <Text style={styles.googleTxt}>Continue with Google</Text>
              </>
            )}
          </Pressable>

          <View style={styles.or}>
            <View style={styles.orLine} />
            <Text style={styles.orTxt}>or</Text>
            <View style={styles.orLine} />
          </View>

          {mode === "up" ? (
            <TextInput
              style={styles.input}
              placeholder="Name"
              placeholderTextColor={colors.faint}
              autoComplete="name"
              textContentType="name"
              value={name}
              onChangeText={setName}
              editable={!busy}
            />
          ) : null}
          <TextInput
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
            placeholder="Email"
            placeholderTextColor={colors.faint}
            value={email}
            onChangeText={setEmail}
            editable={!busy}
          />
          <TextInput
            style={styles.input}
            secureTextEntry
            autoComplete={mode === "up" ? "new-password" : "password"}
            textContentType={mode === "up" ? "newPassword" : "password"}
            placeholder="Password"
            placeholderTextColor={colors.faint}
            value={password}
            onChangeText={setPassword}
            editable={!busy}
          />

          <Pressable
            style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed, busy && styles.disabled]}
            onPress={() => void emailAuth()}
            disabled={busy}
          >
            {pending === "email" ? (
              <ActivityIndicator color={colors.canvas} />
            ) : (
              <Text style={styles.ctaTxt}>{mode === "in" ? "Sign in" : "Create account"}</Text>
            )}
          </Pressable>

          <Pressable
            hitSlop={8}
            disabled={busy}
            onPress={() => {
              setError(null);
              setMode(mode === "in" ? "up" : "in");
            }}
            style={styles.switch}
          >
            <Text style={styles.switchTxt}>
              {mode === "in" ? "Need an account? " : "Have an account? "}
              <Text style={styles.switchLink}>{mode === "in" ? "Create one" : "Sign in"}</Text>
            </Text>
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
  cancel: { alignSelf: "flex-start", marginBottom: 24 },
  cancelTxt: { color: colors.muted, fontSize: 16, fontWeight: "500" },
  brand: { alignItems: "center", marginBottom: 36 },
  mark: { width: 56, height: 56, borderRadius: 14, marginBottom: 20 },
  title: {
    color: colors.ink,
    fontSize: 28,
    fontWeight: "600",
    letterSpacing: -0.6,
  },
  sub: { marginTop: 8, color: colors.muted, fontSize: 15 },
  err: {
    color: colors.pink,
    fontSize: 14,
    textAlign: "center",
    marginBottom: 16,
  },
  google: {
    height: 52,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.tileBorder,
    backgroundColor: colors.canvas,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  googleTxt: { color: colors.ink, fontWeight: "600", fontSize: 16 },
  pressed: { backgroundColor: colors.inputFill },
  or: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginVertical: 22,
  },
  orLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.hairline },
  orTxt: { color: colors.faint, fontSize: 13, fontWeight: "500" },
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
  switch: { marginTop: 22, alignItems: "center" },
  switchTxt: { color: colors.muted, fontSize: 15, textAlign: "center" },
  switchLink: { color: colors.accent, fontWeight: "600" },
});

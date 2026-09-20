import { useState } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { signInEmail, signInGoogle, signUpEmail } from "../lib/auth";
import { useAccounts } from "../lib/account-manager";
import { Glass } from "../ui/Glass";
import { Wallpaper } from "../ui/Wallpaper";
import { colors, radii, space } from "../ui/theme";

const logo = require("../../assets/icon.png");

export function LoginScreen({
  add,
  onCancel,
}: {
  add?: boolean;
  onCancel?: () => void;
}) {
  const { completeAuth } = useAccounts();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"in" | "up">("in");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function finish() {
    await completeAuth();
  }

  async function emailAuth() {
    setBusy(true);
    setError(null);
    try {
      const result =
        mode === "in" ? await signInEmail(email, password) : await signUpEmail(name.trim() || email.split("@")[0], email, password);
      if (result.error) throw new Error(result.error.message ?? "Auth failed");
      await finish();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setBusy(true);
    setError(null);
    try {
      const result = await signInGoogle();
      if (result.error) throw new Error(result.error.message ?? "Google sign-in failed");
      await finish();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.root}>
      <Wallpaper />
      <StatusBar style="light" />
      <View style={styles.center}>
        <View style={styles.brandRow}>
          <Image source={logo} style={styles.brandMark} />
          <Text style={styles.brand}>relay</Text>
        </View>
        <Glass style={styles.card} variant="regular" colorScheme="dark">
          <Text style={styles.h1}>{add ? "Another account" : mode === "in" ? "Sign in" : "Create account"}</Text>
          {add ? <Text style={styles.sub}>Your current account stays signed in.</Text> : null}
          {error ? <Text style={styles.err}>{error}</Text> : null}
          <Pressable style={styles.google} onPress={() => void google()} disabled={busy}>
            <Text style={styles.googleTxt}>Continue with Google</Text>
          </Pressable>
          {mode === "up" ? (
            <TextInput
              style={styles.input}
              placeholder="Full name"
              placeholderTextColor={colors.headerMuted}
              value={name}
              onChangeText={setName}
            />
          ) : null}
          <TextInput
            style={styles.input}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="Email"
            placeholderTextColor={colors.headerMuted}
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            style={styles.input}
            secureTextEntry
            placeholder="Password"
            placeholderTextColor={colors.headerMuted}
            value={password}
            onChangeText={setPassword}
          />
          <Pressable style={styles.cta} onPress={() => void emailAuth()} disabled={busy}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.ctaTxt}>{mode === "in" ? "Sign in" : "Sign up"}</Text>}
          </Pressable>
          <Pressable onPress={() => setMode(mode === "in" ? "up" : "in")}>
            <Text style={styles.switch}>
              {mode === "in" ? "Need an account? Sign up" : "Have an account? Sign in"}
            </Text>
          </Pressable>
          {add ? (
            <Pressable onPress={onCancel}>
              <Text style={styles.switch}>Cancel</Text>
            </Pressable>
          ) : null}
        </Glass>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, justifyContent: "center", padding: 22 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 18, marginLeft: 8 },
  brandMark: { width: 36, height: 36, borderRadius: 18 },
  brand: { color: colors.headerInk, fontSize: 28, fontWeight: "900" },
  card: { padding: space.lg, borderRadius: radii.lg, gap: 10 },
  h1: { color: colors.headerInk, fontSize: 28, fontWeight: "800", marginBottom: 8 },
  sub: { color: colors.headerMuted, marginBottom: 4 },
  err: { color: colors.pink, marginBottom: 4 },
  google: {
    height: 48,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
    alignItems: "center",
    justifyContent: "center",
  },
  googleTxt: { color: colors.headerInk, fontWeight: "700", fontSize: 16 },
  input: {
    height: 48,
    borderRadius: radii.sm,
    paddingHorizontal: 12,
    color: colors.headerInk,
    backgroundColor: "rgba(0,0,0,0.22)",
    fontSize: 16,
  },
  cta: {
    height: 48,
    borderRadius: radii.sm,
    backgroundColor: colors.green,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaTxt: { color: "#fff", fontWeight: "800", fontSize: 16 },
  switch: { color: colors.headerMuted, textAlign: "center", marginTop: 6, fontWeight: "600" },
});

import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as Notifications from "expo-notifications";
import { createAuthClient } from "@neondatabase/auth";

const API = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3001";
const AUTH_URL = process.env.EXPO_PUBLIC_NEON_AUTH_URL;

const authClient = AUTH_URL ? createAuthClient(AUTH_URL) : null;

async function getAccessToken() {
  if (!authClient) return null;
  const { data } = await authClient.token();
  const nested = data as { token?: string; session?: { token?: string } } | null;
  if (nested?.token && nested.token.includes(".")) return nested.token;
  if (nested?.session?.token && nested.session.token.includes(".")) return nested.session.token;
  const session = await authClient.getSession();
  const tok = (session.data as { session?: { token?: string } } | null)?.session?.token;
  return tok && tok.includes(".") ? tok : null;
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

type Channel = {
  id: string;
  name: string;
  isDm: boolean;
  unreadCount: number;
  mentionCount: number;
};
type Msg = { id: string; userName: string; body: string; createdAt: string };

export default function App() {
  const [token, setToken] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [active, setActive] = useState<Channel | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [wsName, setWsName] = useState("Relay");
  const [needsWorkspace, setNeedsWorkspace] = useState(false);
  const [wsDraft, setWsDraft] = useState("");

  useEffect(() => {
    getAccessToken()
      .then((t) => setToken(t))
      .catch(() => setToken(null))
      .finally(() => setBooting(false));
  }, []);

  useEffect(() => {
    if (!token) return;
    void loadWorkspace(token).catch((e) => setError(String(e)));
  }, [token]);

  async function loadWorkspace(authToken: string) {
    const me = await fetchJson("/api/me", authToken);
    if (!me.workspace) {
      setNeedsWorkspace(true);
      return;
    }
    setNeedsWorkspace(false);
    setWsName(me.workspace.name);
    const boot = await fetchJson(`/api/workspaces/${me.workspace.id}/bootstrap`, authToken);
    setChannels(boot.channels);
    registerPush(authToken);
  }

  async function createWorkspace() {
    if (!token || !wsDraft.trim()) return;
    setError(null);
    try {
      await fetchJson("/api/workspaces", token, {
        method: "POST",
        body: JSON.stringify({ name: wsDraft.trim() }),
      });
      await loadWorkspace(token);
    } catch (e) {
      setError(String(e));
    }
  }

  async function emailSignIn() {
    if (!authClient) {
      setError("EXPO_PUBLIC_NEON_AUTH_URL is missing");
      return;
    }
    setError(null);
    const { error: err } = await authClient.signIn.email({ email, password });
    if (err) {
      setError(err.message ?? "Sign-in failed");
      return;
    }
    setToken(await getAccessToken());
  }

  async function google() {
    if (!authClient) {
      setError("EXPO_PUBLIC_NEON_AUTH_URL is missing");
      return;
    }
    setError(null);
    const { error: err } = await authClient.signIn.social({
      provider: "google",
      callbackURL: "/",
    });
    if (err) setError(err.message ?? "Google sign-in failed");
  }

  async function openChannel(ch: Channel) {
    if (!token) return;
    setActive(ch);
    const data = await fetchJson(`/api/channels/${ch.id}/messages`, token);
    setMessages(data.messages);
  }

  async function send() {
    if (!token || !active || !draft.trim()) return;
    const body = draft.trim();
    setDraft("");
    await fetchJson(`/api/channels/${active.id}/messages`, token, {
      method: "POST",
      body: JSON.stringify({ body }),
    });
    const data = await fetchJson(`/api/channels/${active.id}/messages`, token);
    setMessages(data.messages);
  }

  if (booting) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  if (!token) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.login}>
          <StatusBar style="dark" />
          <Text style={styles.brand}>relay</Text>
          <Text style={styles.h1}>Sign in to Relay</Text>
          {error ? <Text style={styles.err}>{error}</Text> : null}
          <Pressable style={styles.google} onPress={google}>
            <Text style={styles.googleTxt}>Sign in with Google</Text>
          </Pressable>
          <TextInput
            style={styles.loginInput}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="Email"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            style={styles.loginInput}
            secureTextEntry
            placeholder="Password"
            value={password}
            onChangeText={setPassword}
          />
          <Pressable style={styles.demo} onPress={emailSignIn}>
            <Text style={styles.demoTxt}>Sign in with email</Text>
          </Pressable>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  if (needsWorkspace) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.login}>
          <StatusBar style="dark" />
          <Text style={styles.brand}>relay</Text>
          <Text style={styles.h1}>Create a workspace</Text>
          {error ? <Text style={styles.err}>{error}</Text> : null}
          <TextInput
            style={styles.loginInput}
            placeholder="Workspace name"
            value={wsDraft}
            onChangeText={setWsDraft}
          />
          <Pressable style={styles.demo} onPress={() => void createWorkspace()}>
            <Text style={styles.demoTxt}>Create workspace</Text>
          </Pressable>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  if (active) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.flex} edges={["top"]}>
          <StatusBar style="light" />
          <View style={styles.header}>
            <Pressable onPress={() => setActive(null)}>
              <Text style={styles.back}>‹</Text>
            </Pressable>
            <Text style={styles.headerTitle}>{active.isDm ? active.name : `#${active.name}`}</Text>
            <View style={{ width: 24 }} />
          </View>
          <KeyboardAvoidingView
            style={styles.flex}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            <FlatList
              style={styles.flex}
              contentContainerStyle={{ padding: 12, paddingBottom: 20 }}
              data={messages}
              keyExtractor={(m) => m.id}
              renderItem={({ item }) => (
                <View style={styles.msg}>
                  <Text style={styles.msgName}>{item.userName}</Text>
                  <Text style={styles.msgBody}>{item.body}</Text>
                </View>
              )}
            />
            <View style={styles.composer}>
              <TextInput
                style={styles.input}
                placeholder={`Message ${active.isDm ? active.name : "#" + active.name}`}
                value={draft}
                onChangeText={setDraft}
                onSubmitEditing={send}
                returnKeyType="send"
              />
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.flex} edges={["top"]}>
        <StatusBar style="light" />
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{wsName}</Text>
        </View>
        {error ? <Text style={styles.err}>{error}</Text> : null}
        <FlatList
          data={channels}
          keyExtractor={(c) => c.id}
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => openChannel(item)}>
              <Text style={[styles.rowTxt, item.unreadCount ? styles.unread : null]}>
                {item.isDm ? "●  " : "#  "}
                {item.name}
              </Text>
              {item.mentionCount ? (
                <View style={styles.pill}>
                  <Text style={styles.pillTxt}>{item.mentionCount}</Text>
                </View>
              ) : null}
            </Pressable>
          )}
        />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

async function fetchJson(path: string, token: string, init?: RequestInit) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

async function registerPush(token: string) {
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== "granted") return;
    const device = await Notifications.getExpoPushTokenAsync();
    await fetchJson("/api/device-tokens", token, {
      method: "POST",
      body: JSON.stringify({ token: device.data, platform: Platform.OS }),
    });
  } catch {
    /* simulator */
  }
}

const aubergine = "#3F0E40";
const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: "#fff" },
  center: { flex: 1, backgroundColor: aubergine, alignItems: "center", justifyContent: "center" },
  login: { flex: 1, backgroundColor: "#fff", padding: 28, justifyContent: "center" },
  brand: { fontSize: 28, fontWeight: "900", marginBottom: 24 },
  h1: { fontSize: 32, fontWeight: "800", marginBottom: 24 },
  err: { color: "#e01e5a", marginBottom: 12 },
  google: {
    borderWidth: 2,
    borderColor: "#1d1c1d",
    height: 48,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  googleTxt: { fontSize: 16, fontWeight: "700" },
  loginInput: {
    borderWidth: 1,
    borderColor: "#868686",
    height: 48,
    borderRadius: 4,
    paddingHorizontal: 12,
    fontSize: 16,
    marginBottom: 12,
  },
  demo: {
    backgroundColor: "#007a5a",
    height: 48,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  demoTxt: { color: "#fff", fontSize: 16, fontWeight: "700" },
  header: {
    backgroundColor: aubergine,
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
  },
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: "800" },
  back: { color: "#fff", fontSize: 28, width: 24 },
  row: {
    height: 48,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#eee",
  },
  rowTxt: { fontSize: 16, color: "#1d1c1d" },
  unread: { fontWeight: "800" },
  pill: {
    backgroundColor: "#e01e5a",
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  pillTxt: { color: "#fff", fontSize: 12, fontWeight: "800" },
  msg: { marginBottom: 12 },
  msgName: { fontWeight: "800", fontSize: 15, marginBottom: 2 },
  msgBody: { fontSize: 15, lineHeight: 22, color: "#1d1c1d" },
  composer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#ddd",
    padding: 10,
    paddingBottom: 16,
    backgroundColor: "#fff",
  },
  input: {
    borderWidth: 1,
    borderColor: "#8a8f98",
    borderRadius: 8,
    minHeight: 40,
    paddingHorizontal: 12,
    fontSize: 16,
  },
});

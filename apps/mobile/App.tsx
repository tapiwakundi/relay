import { useEffect } from "react";
import { ActivityIndicator, Image, StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import * as Linking from "expo-linking";
import { StatusBar } from "expo-status-bar";
import { AccountManager, useAccounts } from "./src/lib/account-manager";
import { api } from "./src/lib/auth";
import { keys, queryClient, type MeResponse } from "./src/lib/query";
import { WorkspaceProvider } from "./src/lib/workspace";
import { RootNav } from "./src/nav/Root";
import { CreateWorkspaceScreen } from "./src/screens/CreateWorkspaceScreen";
import { LoginScreen } from "./src/screens/LoginScreen";
import { Wallpaper } from "./src/ui/Wallpaper";
import { colors } from "./src/ui/theme";

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AccountManager>
            <View style={styles.root}>
              <Wallpaper />
              <Gate />
            </View>
          </AccountManager>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function Gate() {
  const { ready, activeAccountId, adding, cancelAddAccount } = useAccounts();

  useEffect(() => {
    const accept = async (url: string) => {
      const parsed = Linking.parse(url);
      const token = parsed.queryParams?.invite;
      if (typeof token !== "string" || !token) return;
      try {
        await api("/api/invites/accept", { method: "POST", body: JSON.stringify({ token }) });
        await queryClient.invalidateQueries({ queryKey: keys.me });
      } catch {
        /* ignore invalid */
      }
    };
    void Linking.getInitialURL().then((url) => {
      if (url) return accept(url);
    });
    const sub = Linking.addEventListener("url", ({ url }) => void accept(url));
    return () => sub.remove();
  }, []);

  const meQ = useQuery({
    queryKey: keys.me,
    enabled: Boolean(activeAccountId) && !adding,
    queryFn: () => api<MeResponse>("/api/me"),
  });

  if (!ready) return <Splash />;
  if (adding) {
    return <LoginScreen add onCancel={() => void cancelAddAccount()} />;
  }
  if (!activeAccountId) {
    return <LoginScreen />;
  }
  if (meQ.isLoading) return <Splash />;
  if (!meQ.data?.workspace) {
    return <CreateWorkspaceScreen onCreated={() => void queryClient.invalidateQueries({ queryKey: keys.me })} />;
  }

  return (
    <WorkspaceProvider key={activeAccountId}>
      <RootNav />
    </WorkspaceProvider>
  );
}

function Splash() {
  return (
    <View style={styles.splash}>
      <StatusBar style="light" />
      <Image source={require("./assets/icon.png")} style={styles.splashMark} />
      <ActivityIndicator color={colors.ink} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#1A0828" },
  splash: { flex: 1, alignItems: "center", justifyContent: "center", gap: 18 },
  splashMark: { width: 88, height: 88, borderRadius: 44 },
});

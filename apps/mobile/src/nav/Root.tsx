import { useEffect } from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { DarkTheme, NavigationContainer, createNavigationContainerRef } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import * as Notifications from "expo-notifications";
import { StatusBar } from "expo-status-bar";
import type { PushNotificationData } from "@relay/shared";
import { useAccounts } from "../lib/account-manager";
import { navFromPush, openPendingIfReady, setPendingChannelOpener, setPendingNav } from "../lib/pending-nav";
import { useWorkspace } from "../lib/workspace";
import { GlassTabBar } from "./GlassTabBar";
import { ActivityScreen } from "../screens/ActivityScreen";
import { ChannelScreen } from "../screens/ChannelScreen";
import { DmsScreen } from "../screens/DmsScreen";
import { EditProfileScreen } from "../screens/EditProfileScreen";
import { HomeScreen } from "../screens/HomeScreen";
import { InvitesScreen } from "../screens/InvitesScreen";
import { FilesScreen, LaterScreen, ThreadsScreen } from "../screens/ListsScreens";
import { NewChannelScreen } from "../screens/NewChannelScreen";
import { NewDmScreen } from "../screens/NewDmScreen";
import { ProfileScreen } from "../screens/ProfileScreen";
import { SearchScreen } from "../screens/SearchScreen";
import { ThreadScreen } from "../screens/ThreadScreen";
import { WorkspaceSettingsScreen } from "../screens/WorkspaceSettingsScreen";
import { YouScreen } from "../screens/YouScreen";
import { AddWorkspaceScreen } from "../screens/AddWorkspaceScreen";
import type { RootStackParamList, TabParamList } from "./types";

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<TabParamList>();
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

const theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: "transparent", card: "transparent" },
};

function TabNav() {
  return (
    <Tabs.Navigator
      tabBar={(props) => <GlassTabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: "transparent" } }}
    >
      <Tabs.Screen name="Home" component={HomeScreen} />
      <Tabs.Screen name="DMs" component={DmsScreen} />
      <Tabs.Screen name="Activity" component={ActivityScreen} />
      <Tabs.Screen name="You" component={YouScreen} />
    </Tabs.Navigator>
  );
}

function openChannel(channelId: string) {
  if (navigationRef.isReady()) navigationRef.navigate("Channel", { channelId });
}

export function RootNav() {
  const { switchAccount, activeAccountId } = useAccounts();
  const { workspace } = useWorkspace();

  useEffect(() => {
    setPendingChannelOpener((channelId) => openChannel(channelId));
    openPendingIfReady(activeAccountId, workspace.id);
    return () => setPendingChannelOpener(null);
  }, [activeAccountId, workspace.id]);

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as PushNotificationData;
      const nav = navFromPush(data, activeAccountId);
      if (!nav) return;
      setPendingNav(data);
      if (nav.switchAccount) {
        void switchAccount(nav.accountId);
        return;
      }
      openPendingIfReady(activeAccountId, workspace.id);
    });
    return () => sub.remove();
  }, [activeAccountId, switchAccount, workspace.id]);

  return (
    <NavigationContainer ref={navigationRef} theme={theme}>
      <StatusBar style="light" />
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: "transparent" },
          animation: "slide_from_right",
        }}
      >
        <Stack.Screen name="Tabs" component={TabNav} />
        <Stack.Screen name="Channel" component={ChannelScreen} />
        <Stack.Screen name="Thread" component={ThreadScreen} />
        <Stack.Screen name="Profile" component={ProfileScreen} />
        <Stack.Screen name="WorkspaceSettings" component={WorkspaceSettingsScreen} />
        <Stack.Screen name="Invites" component={InvitesScreen} />
        <Stack.Screen name="NewChannel" component={NewChannelScreen} />
        <Stack.Screen name="NewDm" component={NewDmScreen} />
        <Stack.Screen name="Search" component={SearchScreen} />
        <Stack.Screen name="Later" component={LaterScreen} />
        <Stack.Screen name="Files" component={FilesScreen} />
        <Stack.Screen name="Threads" component={ThreadsScreen} />
        <Stack.Screen name="EditProfile" component={EditProfileScreen} />
        <Stack.Screen name="AddWorkspace" component={AddWorkspaceScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

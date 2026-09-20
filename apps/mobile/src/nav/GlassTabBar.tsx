import type { ReactNode } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from "expo-glass-effect";
import { useAccounts } from "../lib/account-manager";
import { useWorkspace } from "../lib/workspace";
import { IconBell, IconChat, IconDots, IconHome, IconSearch } from "../ui/Icons";
import { colors } from "../ui/theme";

const ICONS: Record<string, (props: { color: string; filled?: boolean }) => ReactNode> = {
  Home: ({ color, filled }) => <IconHome color={color} filled={filled} />,
  DMs: ({ color, filled }) => <IconChat color={color} filled={filled} />,
  Activity: ({ color, filled }) => <IconBell color={color} filled={filled} />,
  You: ({ color }) => <IconDots color={color} />,
};

const LABELS: Record<string, string> = {
  Home: "Home",
  DMs: "DMs",
  Activity: "Activity",
  You: "More",
};

const liquid = Platform.OS === "ios" && isGlassEffectAPIAvailable() && isLiquidGlassAvailable();

export function GlassTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { accounts, activeAccountId } = useAccounts();
  const { channels } = useWorkspace();
  const otherUnread = accounts
    .filter((account) => account.id !== activeAccountId)
    .reduce((sum, account) => sum + account.unreadTotal + account.mentionTotal, 0);
  const homeUnread = channels.filter((c) => !c.isDm).reduce((sum, c) => sum + c.unreadCount + c.mentionCount, 0);
  const dmUnread = channels.filter((c) => c.isDm).reduce((sum, c) => sum + c.unreadCount + c.mentionCount, 0);
  const activityUnread = channels.reduce((sum, c) => sum + c.mentionCount, 0) + otherUnread;
  const badges: Record<string, number> = {
    Home: homeUnread,
    DMs: dmUnread,
    Activity: activityUnread,
    You: otherUnread,
  };

  const tabs = state.routes.map((route, index) => {
    const focused = state.index === index;
    const badge = badges[route.name] ?? 0;
    const color = focused ? colors.aubergine : colors.muted;
    const Icon = ICONS[route.name];
    return (
      <Pressable
        key={route.key}
        style={styles.item}
        onPress={() => {
          void Haptics.selectionAsync();
          const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
        }}
      >
        {Icon ? Icon({ color, filled: focused }) : null}
        <Text style={[styles.txt, focused && styles.txtOn]}>{LABELS[route.name] ?? route.name}</Text>
        {badge > 0 ? <View style={styles.dot} /> : null}
      </Pressable>
    );
  });

  const search = (
    <Pressable
      style={styles.searchHit}
      onPress={() => {
        void Haptics.selectionAsync();
        navigation.getParent()?.navigate("Search");
      }}
    >
      <IconSearch />
    </Pressable>
  );

  const wrapStyle = [styles.wrap, { bottom: Math.max(insets.bottom, 10) }];

  if (liquid) {
    return (
      <View style={wrapStyle} pointerEvents="box-none">
        <GlassView style={styles.pill} glassEffectStyle="clear" isInteractive colorScheme="light">
          {tabs}
        </GlassView>
        <GlassView style={styles.search} glassEffectStyle="clear" isInteractive colorScheme="light">
          {search}
        </GlassView>
      </View>
    );
  }

  return (
    <View style={[wrapStyle, { gap: 10 }]}>
      <View style={[styles.pill, styles.fallback]}>{tabs}</View>
      <View style={[styles.search, styles.fallback]}>{search}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 14,
    right: 14,
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  pill: {
    flex: 1,
    height: 56,
    borderRadius: 28,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 4,
  },
  item: { flex: 1, alignItems: "center", gap: 2, paddingVertical: 2 },
  txt: { color: colors.muted, fontWeight: "700", fontSize: 11 },
  txtOn: { color: colors.aubergine },
  dot: {
    position: "absolute",
    top: 0,
    right: 18,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.unread,
  },
  search: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  searchHit: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  fallback: {
    backgroundColor: "rgba(255,255,255,0.72)",
  },
});

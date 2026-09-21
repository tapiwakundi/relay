import type { ReactNode } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { GlassContainer, GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from "expo-glass-effect";
import { useAccounts } from "../lib/account-manager";
import { useWorkspace } from "../lib/workspace";
import { IconBell, IconChat, IconDots, IconHome, IconSearch } from "../ui/Icons";
import { colors } from "../ui/theme";

const ICONS: Record<string, (props: { color: string; filled?: boolean }) => ReactNode> = {
  Home: ({ color, filled }) => <IconHome color={color} filled={filled} size={24} />,
  DMs: ({ color, filled }) => <IconChat color={color} filled={filled} size={24} />,
  Activity: ({ color, filled }) => <IconBell color={color} filled={filled} size={24} />,
  You: ({ color }) => <IconDots color={color} size={24} />,
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
    const color = focused ? colors.aubergine : colors.ink;
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
        {focused ? (
          liquid ? (
            <GlassView
              pointerEvents="none"
              style={styles.indicator}
              glassEffectStyle="regular"
              colorScheme="light"
            />
          ) : (
            <View pointerEvents="none" style={[styles.indicator, styles.indicatorFallback]} />
          )
        ) : null}
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
      <IconSearch color={colors.ink} size={24} />
    </Pressable>
  );

  const wrapStyle = [styles.wrap, { bottom: Math.max(insets.bottom, 8) }];

  if (liquid) {
    return (
      <View style={wrapStyle} pointerEvents="box-none">
        <GlassContainer spacing={10} pointerEvents="box-none" style={styles.row}>
          <GlassView style={styles.pill} glassEffectStyle="clear" isInteractive colorScheme="light">
            {tabs}
          </GlassView>
          <GlassView style={styles.search} glassEffectStyle="clear" isInteractive colorScheme="light">
            {search}
          </GlassView>
        </GlassContainer>
      </View>
    );
  }

  return (
    <View style={wrapStyle} pointerEvents="box-none">
      <View style={styles.row}>
        <View style={[styles.pill, styles.fallback]}>{tabs}</View>
        <View style={[styles.search, styles.fallback]}>{search}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 12,
    right: 12,
    height: 64,
  },
  row: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  pill: {
    flex: 1,
    height: 64,
    borderRadius: 32,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 4,
  },
  item: {
    flex: 1,
    height: 64,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  indicator: {
    position: "absolute",
    top: 6,
    bottom: 6,
    left: 4,
    right: 4,
    borderRadius: 26,
  },
  indicatorFallback: {
    backgroundColor: "rgba(120, 120, 128, 0.14)",
  },
  txt: { color: colors.ink, fontWeight: "600", fontSize: 11 },
  txtOn: { color: colors.aubergine, fontWeight: "700" },
  dot: {
    position: "absolute",
    top: 8,
    right: 16,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.unread,
  },
  search: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  searchHit: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  fallback: {
    backgroundColor: "rgba(255,255,255,0.82)",
  },
});

import { Pressable, StyleSheet, Text, View } from "react-native";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useAccounts } from "../lib/account-manager";
import { useWorkspace } from "../lib/workspace";
import { Glass, GlassGroup } from "../ui/Glass";
import { colors, radii } from "../ui/theme";

const LABELS: Record<string, string> = {
  Home: "Home",
  DMs: "DMs",
  Activity: "Activity",
  You: "You",
};

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

  return (
    <View style={[styles.wrap, { bottom: Math.max(insets.bottom, 10) }]} pointerEvents="box-none">
      <GlassGroup style={styles.row} spacing={10}>
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const badge = badges[route.name] ?? 0;
          return (
            <Glass
              key={route.key}
              variant={focused ? "clear" : "regular"}
              interactive
              style={[styles.item, focused && styles.on]}
            >
              <Pressable
                style={styles.press}
                onPress={() => {
                  void Haptics.selectionAsync();
                  const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
                  if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
                }}
              >
                <Text style={[styles.txt, focused && styles.txtOn]}>{LABELS[route.name] ?? route.name}</Text>
                {badge > 0 ? <View style={styles.dot} /> : null}
              </Pressable>
            </Glass>
          );
        })}
      </GlassGroup>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 14, right: 14 },
  row: { flexDirection: "row", gap: 8 },
  item: { flex: 1, borderRadius: radii.pill },
  on: { borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.35)" },
  press: { paddingVertical: 12, alignItems: "center" },
  txt: { color: colors.muted, fontWeight: "800", fontSize: 13 },
  txtOn: { color: colors.ink },
  dot: {
    position: "absolute",
    top: 6,
    right: 18,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.unread,
  },
});

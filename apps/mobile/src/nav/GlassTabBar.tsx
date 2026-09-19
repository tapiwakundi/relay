import { Pressable, StyleSheet, Text, View } from "react-native";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
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
  return (
    <View style={[styles.wrap, { bottom: Math.max(insets.bottom, 10) }]} pointerEvents="box-none">
      <GlassGroup style={styles.row} spacing={10}>
        {state.routes.map((route, index) => {
          const focused = state.index === index;
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
});

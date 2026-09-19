import { type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, space } from "./theme";

export function ScreenHeader({
  title,
  left,
  right,
  subtitle,
}: {
  title: string;
  subtitle?: string;
  left?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.side}>{left}</View>
      <View style={styles.mid}>
        <Text numberOfLines={1} style={styles.title}>
          {title}
        </Text>
        {subtitle ? (
          <Text numberOfLines={1} style={styles.sub}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View style={[styles.side, styles.right]}>{right}</View>
    </View>
  );
}

export function HeaderBtn({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={10}>
      <Text style={styles.btn}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.sm,
    paddingVertical: 8,
    gap: 8,
  },
  side: { minWidth: 52 },
  right: { alignItems: "flex-end" },
  mid: { flex: 1, alignItems: "center" },
  title: { color: colors.ink, fontSize: 17, fontWeight: "800" },
  sub: { color: colors.muted, fontSize: 12, marginTop: 1 },
  btn: { color: colors.ink, fontSize: 17, fontWeight: "700" },
});

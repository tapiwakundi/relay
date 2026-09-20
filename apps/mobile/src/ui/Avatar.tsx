import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { hue, initials } from "../lib/format";
import { colors } from "./theme";

export function Avatar({
  name,
  image,
  size = 36,
  onPress,
  presence,
}: {
  name: string;
  image?: string | null;
  size?: number;
  onPress?: () => void;
  presence?: string | null;
}) {
  const [broken, setBroken] = useState(false);
  const show = Boolean(image && !broken);
  const inner = (
    <View
      style={[
        styles.wrap,
        {
          width: size,
          height: size,
          borderRadius: size * 0.28,
          backgroundColor: show ? "transparent" : hue(name),
        },
      ]}
    >
      {show ? (
        <Image
          source={{ uri: image! }}
          style={{ width: size, height: size }}
          contentFit="cover"
          onError={() => setBroken(true)}
        />
      ) : (
        <Text style={[styles.initials, { fontSize: size * 0.38 }]}>{initials(name)}</Text>
      )}
      {presence ? (
        <View
          style={[
            styles.dot,
            {
              backgroundColor: presence === "active" ? colors.green : presence === "dnd" ? colors.pink : colors.faint,
              width: Math.max(8, size * 0.22),
              height: Math.max(8, size * 0.22),
            },
          ]}
        />
      ) : null}
    </View>
  );
  if (onPress) {
    return (
      <Pressable onPress={onPress} hitSlop={8}>
        {inner}
      </Pressable>
    );
  }
  return inner;
}

const styles = StyleSheet.create({
  wrap: { overflow: "hidden", alignItems: "center", justifyContent: "center" },
  initials: { color: "#fff", fontWeight: "800" },
  dot: {
    position: "absolute",
    right: -1,
    bottom: -1,
    borderRadius: 99,
    borderWidth: 2,
              borderColor: "#fff",
  },
});

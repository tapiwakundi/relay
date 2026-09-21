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
  round,
}: {
  name: string;
  image?: string | null;
  size?: number;
  onPress?: () => void;
  presence?: string | null;
  round?: boolean;
}) {
  const [broken, setBroken] = useState(false);
  const show = Boolean(image && !broken);
  const radius = round ? size / 2 : size * 0.28;
  const inner = (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <View
        style={[
          styles.face,
          {
            width: size,
            height: size,
            borderRadius: radius,
            backgroundColor: show ? "transparent" : hue(name),
          },
        ]}
      >
        {show ? (
          <Image
            source={{ uri: image! }}
            style={{ width: size, height: size, borderRadius: radius }}
            contentFit="cover"
            onError={() => setBroken(true)}
          />
        ) : (
          <Text style={[styles.initials, { fontSize: size * 0.38 }]}>{initials(name)}</Text>
        )}
      </View>
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
      <Pressable onPress={onPress} hitSlop={8} style={styles.hit}>
        {inner}
      </Pressable>
    );
  }
  return inner;
}

const styles = StyleSheet.create({
  wrap: { overflow: "visible" },
  hit: { overflow: "visible" },
  face: { overflow: "hidden", alignItems: "center", justifyContent: "center" },
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

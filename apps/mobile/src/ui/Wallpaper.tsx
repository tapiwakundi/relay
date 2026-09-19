import { StyleSheet, View } from "react-native";
import { colors } from "./theme";

export function Wallpaper() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            experimental_backgroundImage: `linear-gradient(160deg, ${colors.wallpaper[0]}, ${colors.wallpaper[1]}, ${colors.wallpaper[2]})`,
          },
        ]}
      />
      <View style={[styles.orb, styles.a]} />
      <View style={[styles.orb, styles.b]} />
      <View style={[styles.orb, styles.c]} />
    </View>
  );
}

const styles = StyleSheet.create({
  orb: {
    position: "absolute",
    borderRadius: 999,
    opacity: 0.55,
  },
  a: {
    width: 280,
    height: 280,
    top: -40,
    right: -60,
    backgroundColor: "#E01E5A",
  },
  b: {
    width: 220,
    height: 220,
    top: 220,
    left: -80,
    backgroundColor: "#36C5F0",
  },
  c: {
    width: 260,
    height: 260,
    bottom: 40,
    right: -40,
    backgroundColor: "#2EB67D",
  },
});

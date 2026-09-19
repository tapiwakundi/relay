import { StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors } from "./theme";

export function Wallpaper() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <LinearGradient colors={[...colors.wallpaper]} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={StyleSheet.absoluteFill} />
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

import { type ReactNode } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Glass } from "./Glass";
import { colors, radii, space } from "./theme";

export function Sheet({
  open,
  onClose,
  children,
  title,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} />
      <View style={[styles.wrap, { paddingBottom: insets.bottom + 12 }]}>
        <Glass style={styles.sheet} variant="regular" tintColor="#1A0828">
          <View style={styles.handle} />
          {title ? <Text style={styles.title}>{title}</Text> : null}
          {children}
        </Glass>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.35)" },
  wrap: { marginTop: "auto", paddingHorizontal: 10 },
  sheet: { padding: space.md, borderRadius: radii.lg },
  handle: {
    alignSelf: "center",
    width: 42,
    height: 5,
    borderRadius: 99,
    backgroundColor: "rgba(255,255,255,0.28)",
    marginBottom: 12,
  },
  title: { color: colors.ink, fontSize: 18, fontWeight: "800", marginBottom: 12 },
});

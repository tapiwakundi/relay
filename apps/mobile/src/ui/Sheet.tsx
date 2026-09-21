import { type ReactNode, useEffect, useRef, useState } from "react";
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "./theme";

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
  const [mounted, setMounted] = useState(open);
  const scrim = useRef(new Animated.Value(open ? 1 : 0)).current;
  const sheet = useRef(new Animated.Value(open ? 0 : 1)).current;

  useEffect(() => {
    if (open) {
      setMounted(true);
      scrim.setValue(0);
      sheet.setValue(1);
      Animated.parallel([
        Animated.timing(scrim, { toValue: 1, duration: 220, useNativeDriver: true, easing: Easing.out(Easing.quad) }),
        Animated.spring(sheet, { toValue: 0, damping: 24, stiffness: 260, mass: 0.86, useNativeDriver: true }),
      ]).start();
      return;
    }
    Animated.parallel([
      Animated.timing(scrim, { toValue: 0, duration: 180, useNativeDriver: true, easing: Easing.in(Easing.quad) }),
      Animated.timing(sheet, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
        easing: Easing.in(Easing.cubic),
      }),
    ]).start(({ finished }) => {
      if (finished) setMounted(false);
    });
  }, [open, scrim, sheet]);

  if (!mounted) return null;

  return (
    <Modal
      visible
      transparent
      animationType="none"
      presentationStyle="overFullScreen"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <Animated.View pointerEvents="none" style={[styles.scrim, { opacity: scrim }]} />
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View
          style={[
            styles.wrap,
            {
              paddingBottom: Math.max(insets.bottom, 12),
              transform: [
                {
                  translateY: sheet.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, 640],
                  }),
                },
              ],
            },
          ]}
        >
          <View style={styles.sheet}>
            <View style={styles.handle} />
            {title ? <Text style={styles.title}>{title}</Text> : null}
            {children}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.16)",
  },
  wrap: { paddingHorizontal: 8 },
  sheet: {
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 8,
    borderRadius: 28,
    backgroundColor: colors.canvas,
    overflow: "hidden",
  },
  handle: {
    alignSelf: "center",
    width: 36,
    height: 5,
    borderRadius: 99,
    backgroundColor: "rgba(60,60,67,0.18)",
    marginBottom: 12,
  },
  title: { color: colors.ink, fontSize: 18, fontWeight: "800", marginBottom: 12 },
});

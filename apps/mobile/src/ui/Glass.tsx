import { type ReactNode, useEffect, useState } from "react";
import { AccessibilityInfo, Platform, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { BlurView } from "expo-blur";
import { GlassContainer, GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from "expo-glass-effect";
import { colors, radii } from "./theme";

export function canUseLiquidGlass() {
  return Platform.OS === "ios" && isGlassEffectAPIAvailable() && isLiquidGlassAvailable();
}

export function Glass({
  children,
  style,
  tintColor,
  variant = "regular",
  interactive = false,
  fallback = "dark",
}: {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  tintColor?: string;
  variant?: "regular" | "clear";
  interactive?: boolean;
  fallback?: "dark" | "light";
}) {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const sub = AccessibilityInfo.addEventListener("reduceTransparencyChanged", setReduce);
    void AccessibilityInfo.isReduceTransparencyEnabled?.().then(setReduce);
    return () => sub.remove();
  }, []);

  if (canUseLiquidGlass() && !reduce) {
    return (
      <GlassView
        style={[styles.clip, style]}
        glassEffectStyle={variant}
        tintColor={tintColor ?? colors.glassTint}
        isInteractive={interactive}
        colorScheme="dark"
      >
        {children}
      </GlassView>
    );
  }

  if (!reduce) {
    return (
      <BlurView intensity={42} tint={fallback} style={[styles.clip, styles.fallback, style]}>
        {children}
      </BlurView>
    );
  }

  return <View style={[styles.clip, styles.solid, style]}>{children}</View>;
}

export function GlassGroup({
  children,
  style,
  spacing = 8,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  spacing?: number;
}) {
  if (canUseLiquidGlass()) {
    return (
      <GlassContainer spacing={spacing} style={style}>
        {children}
      </GlassContainer>
    );
  }
  return <View style={style}>{children}</View>;
}

const styles = StyleSheet.create({
  clip: {
    overflow: "hidden",
    borderRadius: radii.md,
  },
  fallback: {
    backgroundColor: colors.fallback,
  },
  solid: {
    backgroundColor: colors.fallbackStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
  },
});

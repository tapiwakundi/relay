import { type ReactNode, useEffect, useState } from "react";
import { AccessibilityInfo, Platform, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { BlurView } from "expo-blur";
import { GlassContainer, GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from "expo-glass-effect";
import { colors, radii } from "./theme";

export function canUseLiquidGlass() {
  return Platform.OS === "ios" && isGlassEffectAPIAvailable() && isLiquidGlassAvailable();
}

// UIGlassEffect is applied once, on the first layout. If that layout has no size,
// or an ancestor opacity is below 1, the material never appears. Wait until after
// layout before mounting GlassView.
export function useGlassReady() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setReady(true));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, []);
  return ready;
}

export function Glass({
  children,
  style,
  tintColor,
  variant = "regular",
  interactive = false,
  fallback = "dark",
  colorScheme,
}: {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  tintColor?: string;
  variant?: "regular" | "clear";
  interactive?: boolean;
  fallback?: "dark" | "light";
  colorScheme?: "auto" | "light" | "dark";
}) {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const sub = AccessibilityInfo.addEventListener("reduceTransparencyChanged", setReduce);
    void AccessibilityInfo.isReduceTransparencyEnabled?.().then(setReduce);
    return () => sub.remove();
  }, []);
  const scheme = colorScheme ?? (fallback === "light" ? "light" : "dark");
  const light = scheme === "light" || fallback === "light";

  if (canUseLiquidGlass() && !reduce) {
    return (
      <GlassView
        style={style}
        glassEffectStyle={variant}
        {...(tintColor || !light ? { tintColor: tintColor ?? colors.glassTint } : {})}
        isInteractive={interactive}
        colorScheme={scheme}
      >
        {children}
      </GlassView>
    );
  }

  if (!reduce) {
    return (
      <BlurView
        intensity={light ? 64 : 42}
        tint={light ? "light" : "dark"}
        style={[styles.clip, light ? styles.fallbackLight : styles.fallback, style]}
      >
        {children}
      </BlurView>
    );
  }

  return <View style={[styles.clip, light ? styles.solidLight : styles.solid, style]}>{children}</View>;
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
  return <View style={[{ gap: spacing }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  clip: {
    overflow: "hidden",
    borderRadius: radii.md,
  },
  fallback: {
    backgroundColor: colors.fallback,
  },
  fallbackLight: {
    backgroundColor: colors.fallbackLight,
  },
  solid: {
    backgroundColor: colors.fallbackStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
  },
  solidLight: {
    backgroundColor: colors.fallbackLightStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
  },
});

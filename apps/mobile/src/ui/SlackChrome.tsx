import { useState, type ReactNode } from "react";
import { Platform, Pressable, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { Avatar } from "./Avatar";
import { Glass } from "./Glass";
import { colors } from "./theme";

export function useCompactScroll(threshold = 20) {
  const [compact, setCompact] = useState(false);
  return {
    compact,
    scrollEventThrottle: 16 as const,
    onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const next = e.nativeEvent.contentOffset.y > threshold;
      setCompact((prev) => (prev === next ? prev : next));
    },
  };
}

export function ScrollingHero({
  title,
  onTitlePress,
  chevron,
}: {
  title: string;
  onTitlePress?: () => void;
  chevron?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.hero, { paddingTop: insets.top }]}>
      <View style={styles.heroRow}>
        <Pressable style={styles.heroTitle} onPress={onTitlePress} disabled={!onTitlePress}>
          <Text numberOfLines={1} style={styles.heroName}>
            {title}
          </Text>
          {chevron ? <Text style={styles.heroChev}>▾</Text> : null}
        </Pressable>
      </View>
    </View>
  );
}

export function FloatingWorkspaceChrome({
  compact,
  glyph,
  meName,
  meImage,
  mePresence,
  onWorkspacePress,
  onMe,
}: {
  compact: boolean;
  glyph: ReactNode;
  meName: string;
  meImage?: string | null;
  mePresence?: string;
  onWorkspacePress: () => void;
  onMe: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={[styles.overlay, { paddingTop: insets.top }]}>
      <StatusBar style={compact ? "dark" : "light"} />
      <View style={styles.overlayRow} pointerEvents="box-none">
        <Pressable onPress={onWorkspacePress} style={[styles.glyphHit, compact && styles.glyphHitCompact]}>
          {glyph}
        </Pressable>
        <View style={{ flex: 1 }} />
        <Pressable style={[styles.meBtn, compact && styles.meBtnCompact]} onPress={onMe}>
          <Avatar name={meName} image={meImage} size={32} presence={compact ? mePresence : undefined} />
        </Pressable>
      </View>
    </View>
  );
}

export function AubergineHeader({
  title,
  left,
  right,
  onTitlePress,
}: {
  title: string;
  left?: ReactNode;
  right?: ReactNode;
  onTitlePress?: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingTop: insets.top }]}>
      <StatusBar style="light" />
      <View style={styles.row}>
        <Pressable style={styles.titleWrap} onPress={onTitlePress} disabled={!onTitlePress}>
          {left}
          <Text numberOfLines={1} style={styles.title}>
            {title}
          </Text>
          {onTitlePress ? <Text style={styles.chev}>▾</Text> : null}
        </Pressable>
        <View style={styles.right}>{right}</View>
      </View>
    </View>
  );
}

export function PageHeader({
  title,
  subtitle,
  onBack,
  back = "back",
  right,
  sheet = false,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  back?: "back" | "close";
  right?: ReactNode;
  sheet?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const paddingTop = sheet && Platform.OS === "ios" ? 10 : insets.top;
  return (
    <View style={[styles.pageHeader, { paddingTop }]}>
      <StatusBar style="dark" />
      <View style={styles.pageSide}>
        {onBack ? (
          <GlassIconButton
            label={back === "close" ? "Close" : "Back"}
            icon={back === "close" ? "close" : "chevron-back"}
            onPress={onBack}
          />
        ) : null}
      </View>
      <View style={styles.pageTitleWrap}>
        <Text numberOfLines={1} style={styles.pageTitle}>
          {title}
        </Text>
        {subtitle ? (
          <Text numberOfLines={1} style={styles.pageSub}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View style={[styles.pageSide, styles.pageSideRight]}>{right}</View>
    </View>
  );
}

function GlassIconButton({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon: "close" | "chevron-back";
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.glassHit, pressed && styles.glassPressed]}
    >
      <Glass style={styles.glassBtn} fallback="light" colorScheme="light" variant="regular" interactive>
        <View style={styles.glassInner} pointerEvents="none">
          <Ionicons name={icon} size={icon === "close" ? 26 : 24} color={colors.ink} />
        </View>
      </Glass>
    </Pressable>
  );
}

export function ScreenCanvas({ children }: { children: ReactNode }) {
  return <View style={styles.canvas}>{children}</View>;
}

const styles = StyleSheet.create({
  bar: { backgroundColor: colors.hero },
  row: {
    height: 52,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  titleWrap: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, minWidth: 0 },
  title: { color: colors.headerInk, fontSize: 22, fontWeight: "800", letterSpacing: -0.4, flexShrink: 1 },
  chev: { color: colors.headerMuted, fontSize: 13, marginTop: 2 },
  right: { flexDirection: "row", alignItems: "center", gap: 10 },
  canvas: { flex: 1, backgroundColor: colors.canvas },
  hero: { backgroundColor: colors.hero },
  heroRow: {
    height: 52,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
  },
  heroTitle: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingLeft: 40,
    minWidth: 0,
  },
  heroName: { color: colors.headerInk, fontSize: 22, fontWeight: "800", letterSpacing: -0.4, flexShrink: 1 },
  heroChev: { color: colors.headerMuted, fontSize: 13, marginTop: 2 },
  overlay: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
  },
  overlayRow: {
    height: 52,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  glyphHit: {
    width: 32,
    height: 32,
    borderRadius: 8,
    overflow: "hidden",
  },
  glyphHitCompact: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: "visible",
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  meBtn: {
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.92)",
  },
  meBtnCompact: {
    borderColor: "#fff",
    shadowColor: "#000",
    shadowOpacity: 0.14,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  pageHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 4,
    minHeight: 44,
  },
  pageSide: {
    flex: 1,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
  },
  pageSideRight: { justifyContent: "flex-end" },
  pageTitleWrap: { alignItems: "center", justifyContent: "center", maxWidth: "62%" },
  pageTitle: { color: colors.ink, fontSize: 17, fontWeight: "700", textAlign: "center" },
  pageSub: { color: colors.muted, fontSize: 13, marginTop: 1, textAlign: "center" },
  glassHit: {
    width: 44,
    height: 44,
    borderRadius: 22,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  glassBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(60,60,67,0.2)",
  },
  glassInner: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  glassPressed: { opacity: 0.55 },
});

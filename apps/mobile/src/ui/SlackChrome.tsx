import { useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Avatar } from "./Avatar";
import { IconPencil } from "./Icons";
import { colors, space } from "./theme";

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
  onCompose,
  onMe,
}: {
  compact: boolean;
  glyph: ReactNode;
  meName: string;
  meImage?: string | null;
  mePresence?: string;
  onWorkspacePress: () => void;
  onCompose: () => void;
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
        <Pressable style={[styles.compose, compact && styles.composeCompact]} onPress={onCompose}>
          <IconPencil size={16} color={compact ? colors.ink : colors.headerInk} />
        </Pressable>
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
  left,
  right,
  subtitle,
}: {
  title: string;
  subtitle?: string;
  left?: ReactNode;
  right?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.pageBar, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      <View style={styles.pageRow}>
        <View style={styles.side}>{left}</View>
        <View style={styles.mid}>
          <Text numberOfLines={1} style={styles.pageTitle}>
            {title}
          </Text>
          {subtitle ? (
            <Text numberOfLines={1} style={styles.pageSub}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        <View style={[styles.side, styles.sideRight]}>{right}</View>
      </View>
    </View>
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
  compose: {
    width: 44,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
    justifyContent: "center",
  },
  composeCompact: {
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOpacity: 0.14,
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
  pageBar: {
    backgroundColor: colors.canvas,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
  },
  pageRow: {
    height: 52,
    paddingHorizontal: space.sm,
    flexDirection: "row",
    alignItems: "center",
  },
  side: { minWidth: 52 },
  sideRight: { alignItems: "flex-end" },
  mid: { flex: 1, alignItems: "center" },
  pageTitle: { color: colors.ink, fontSize: 17, fontWeight: "800" },
  pageSub: { color: colors.muted, fontSize: 12, marginTop: 1 },
});

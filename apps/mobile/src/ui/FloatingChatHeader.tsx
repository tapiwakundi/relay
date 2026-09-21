import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { GlassContainer, GlassView } from "expo-glass-effect";
import { canUseLiquidGlass } from "./Glass";
import { IconHash, IconHeadphones } from "./Icons";
import { Avatar } from "./Avatar";
import { colors } from "./theme";

export const CHAT_HEADER_CHIP = 48;

export function chatHeaderInset(safeTop: number) {
  return safeTop + 8 + CHAT_HEADER_CHIP + 8;
}

export function FloatingChatHeader({
  title,
  subtitle,
  avatarName,
  avatarImage,
  showHash,
  showPerson,
  onBack,
  onTitlePress,
  onHuddle,
  huddleJoined,
  huddleBusy,
}: {
  title: string;
  subtitle?: string;
  avatarName?: string;
  avatarImage?: string | null;
  showHash?: boolean;
  showPerson?: boolean;
  onBack: () => void;
  onTitlePress?: () => void;
  onHuddle?: () => void;
  huddleJoined?: boolean;
  huddleBusy?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const liquid = canUseLiquidGlass();

  const chips = (
    <>
      <GlassChip style={styles.circle} onPress={onBack} accessibilityLabel="Back" liquid={liquid}>
        <Ionicons name="chevron-back" size={22} color={colors.ink} />
      </GlassChip>
      <GlassChip
        style={styles.pill}
        onPress={onTitlePress}
        accessibilityLabel={title}
        liquid={liquid}
        hitStyle={styles.pillHit}
      >
        {showPerson ? (
          <View style={styles.hash}>
            <Ionicons name="person" size={18} color={colors.ink} />
          </View>
        ) : showHash ? (
          <View style={styles.hash}>
            <IconHash color={colors.ink} size={16} />
          </View>
        ) : (
          <Avatar name={avatarName ?? title} image={avatarImage} size={36} round />
        )}
        <View style={styles.meta}>
          <Text numberOfLines={1} style={styles.title}>
            {title}
          </Text>
          {subtitle ? (
            <Text numberOfLines={1} style={styles.sub}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </GlassChip>
      {onHuddle ? (
        <GlassChip
          style={styles.circle}
          onPress={huddleBusy ? undefined : onHuddle}
          accessibilityLabel={huddleJoined ? "Leave huddle" : "Join huddle"}
          liquid={liquid}
        >
          <IconHeadphones size={22} filled={huddleJoined} color={huddleJoined ? colors.green : colors.ink} />
        </GlassChip>
      ) : null}
    </>
  );

  return (
    <View pointerEvents="box-none" style={[styles.overlay, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      {liquid ? (
        <GlassContainer spacing={8} pointerEvents="box-none" style={styles.row}>
          {chips}
        </GlassContainer>
      ) : (
        <View pointerEvents="box-none" style={styles.row}>
          {chips}
        </View>
      )}
    </View>
  );
}

function GlassChip({
  style,
  hitStyle,
  children,
  onPress,
  accessibilityLabel,
  liquid,
}: {
  style: StyleProp<ViewStyle>;
  hitStyle?: StyleProp<ViewStyle>;
  children: ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  liquid: boolean;
}) {
  function press() {
    if (!onPress) return;
    void Haptics.selectionAsync();
    onPress();
  }

  const inner = (
    <Pressable
      onPress={onPress ? press : undefined}
      disabled={!onPress}
      style={[styles.hit, hitStyle]}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={accessibilityLabel}
    >
      {children}
    </Pressable>
  );

  if (liquid) {
    return (
      <GlassView style={style} glassEffectStyle="clear" isInteractive={Boolean(onPress)} colorScheme="light">
        {inner}
      </GlassView>
    );
  }

  return <View style={[style, styles.fallback]}>{inner}</View>;
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    zIndex: 20,
  },
  row: {
    height: CHAT_HEADER_CHIP,
    marginHorizontal: 12,
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  circle: {
    width: CHAT_HEADER_CHIP,
    height: CHAT_HEADER_CHIP,
    borderRadius: CHAT_HEADER_CHIP / 2,
  },
  pill: {
    flex: 1,
    height: CHAT_HEADER_CHIP,
    borderRadius: CHAT_HEADER_CHIP / 2,
    minWidth: 0,
  },
  hit: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  pillHit: {
    flexDirection: "row",
    justifyContent: "flex-start",
    paddingLeft: 6,
    paddingRight: 14,
    gap: 8,
  },
  hash: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.04)",
  },
  meta: { flex: 1, minWidth: 0 },
  title: { color: colors.ink, fontSize: 16, fontWeight: "800", letterSpacing: -0.2 },
  sub: { color: colors.muted, fontSize: 12, fontWeight: "600", marginTop: 1 },
  fallback: {
    backgroundColor: "rgba(255,255,255,0.96)",
  },
});

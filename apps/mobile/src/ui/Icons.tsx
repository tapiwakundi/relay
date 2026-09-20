import type { ComponentProps } from "react";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "./theme";

type Name = ComponentProps<typeof Ionicons>["name"];

function Ion({
  name,
  color = colors.muted,
  size = 22,
}: {
  name: Name;
  color?: string;
  size?: number;
}) {
  return <Ionicons name={name} size={size} color={color} />;
}

export function IconHome({ color = colors.muted, size = 22, filled }: { color?: string; size?: number; filled?: boolean }) {
  return <Ion name={filled ? "home" : "home-outline"} color={color} size={size} />;
}

export function IconChat({ color = colors.muted, size = 22, filled }: { color?: string; size?: number; filled?: boolean }) {
  return <Ion name={filled ? "chatbubbles" : "chatbubbles-outline"} color={color} size={size} />;
}

export function IconBell({ color = colors.muted, size = 22, filled }: { color?: string; size?: number; filled?: boolean }) {
  return <Ion name={filled ? "notifications" : "notifications-outline"} color={color} size={size} />;
}

export function IconDots({ color = colors.muted, size = 22 }: { color?: string; size?: number }) {
  return <Ion name="ellipsis-horizontal" color={color} size={size} />;
}

export function IconSearch({ color = colors.ink, size = 22 }: { color?: string; size?: number }) {
  return <Ion name="search" color={color} size={size} />;
}

export function IconPencil({ color = colors.headerInk, size = 18 }: { color?: string; size?: number }) {
  return <Ion name="create-outline" color={color} size={size} />;
}

export function IconHash({ color = colors.muted, size = 16 }: { color?: string; size?: number }) {
  return <Ion name="hash" color={color} size={size} />;
}

export function IconLock({ color = colors.muted, size = 16 }: { color?: string; size?: number }) {
  return <Ion name="lock-closed" color={color} size={size} />;
}

export function IconPlus({ color = "#fff", size = 22 }: { color?: string; size?: number }) {
  return <Ion name="add" color={color} size={size} />;
}

export function IconHeadphones({ color = colors.muted, size = 22 }: { color?: string; size?: number }) {
  return <Ion name="headset-outline" color={color} size={size} />;
}

export function IconBookmark({ color = colors.muted, size = 22 }: { color?: string; size?: number }) {
  return <Ion name="bookmark-outline" color={color} size={size} />;
}

export function IconThreads({ color = colors.muted, size = 22 }: { color?: string; size?: number }) {
  return <Ion name="chatbox-ellipses-outline" color={color} size={size} />;
}

export function IconStar({ color = colors.muted, size = 16 }: { color?: string; size?: number }) {
  return <Ion name="star-outline" color={color} size={size} />;
}

export function IconSlackbot({ size = 22 }: { size?: number }) {
  return <Ion name="sparkles" color={colors.aubergine} size={size} />;
}

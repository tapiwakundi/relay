import { Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import type { Workspace } from "@relay/shared";

export function WorkspaceGlyph({
  workspace,
  size = 36,
  round,
  onPress,
}: {
  workspace: Pick<Workspace, "name" | "iconColor" | "iconLetter" | "iconUrl">;
  size?: number;
  round?: boolean;
  onPress?: () => void;
}) {
  const inner = (
    <View
      style={[
        styles.box,
        {
          width: size,
          height: size,
          borderRadius: round ? size / 2 : size * 0.22,
          backgroundColor: workspace.iconColor,
        },
      ]}
    >
      {workspace.iconUrl ? (
        <Image source={{ uri: workspace.iconUrl }} style={{ width: size, height: size }} contentFit="cover" />
      ) : (
        <Text style={[styles.letter, { fontSize: size * 0.42 }]}>{workspace.iconLetter}</Text>
      )}
    </View>
  );
  if (onPress) return <Pressable onPress={onPress}>{inner}</Pressable>;
  return inner;
}

const styles = StyleSheet.create({
  box: { overflow: "hidden", alignItems: "center", justifyContent: "center" },
  letter: { color: "#fff", fontWeight: "800" },
});

import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import * as ImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../lib/auth";
import { ICON_COLORS } from "../lib/format";
import { keys, queryClient } from "../lib/query";
import { useWorkspace } from "../lib/workspace";
import { Glass } from "../ui/Glass";
import { WorkspaceGlyph } from "../ui/Glyph";
import { HeaderBtn, ScreenHeader } from "../ui/Header";
import { colors, radii, space } from "../ui/theme";
import type { RootStackParamList } from "../nav/types";

type Props = NativeStackScreenProps<RootStackParamList, "WorkspaceSettings">;

export function WorkspaceSettingsScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { workspace, me } = useWorkspace();
  const [name, setName] = useState(workspace.name);
  const [iconColor, setIconColor] = useState(workspace.iconColor);
  const [iconLetter, setIconLetter] = useState(workspace.iconLetter);
  const [error, setError] = useState<string | null>(null);
  const admin = me.role === "owner" || me.role === "admin";

  async function save() {
    setError(null);
    try {
      await api(`/api/workspaces/${workspace.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name, iconColor, iconLetter }),
      });
      navigation.goBack();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function pickIcon() {
    const img = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.85 });
    if (img.canceled || !img.assets[0]) return;
    const asset = img.assets[0];
    const form = new FormData();
    form.append(
      "file",
      {
        uri: asset.uri,
        name: asset.fileName ?? "icon.jpg",
        type: asset.mimeType ?? "image/jpeg",
      } as unknown as Blob,
    );
    await api(`/api/workspaces/${workspace.id}/icon`, { method: "POST", body: form });
    await queryClient.invalidateQueries({ queryKey: keys.me });
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <Glass style={styles.head}>
        <ScreenHeader
          title="Workspace"
          left={<HeaderBtn label="‹" onPress={() => navigation.goBack()} />}
          right={admin ? <HeaderBtn label="Save" onPress={() => void save()} /> : undefined}
        />
      </Glass>
      <ScrollView contentContainerStyle={{ padding: space.md }}>
        <Glass style={styles.card}>
          <Pressable onPress={() => admin && void pickIcon()} style={{ alignSelf: "center" }}>
            <WorkspaceGlyph workspace={{ ...workspace, iconColor, iconLetter }} size={72} />
          </Pressable>
          {admin ? <Text style={styles.hint}>Tap icon to upload a photo</Text> : null}
          {error ? <Text style={styles.err}>{error}</Text> : null}
          <Text style={styles.label}>Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            editable={admin}
            placeholderTextColor={colors.faint}
          />
          <Text style={styles.label}>Letter</Text>
          <TextInput
            style={styles.input}
            value={iconLetter}
            onChangeText={(t) => setIconLetter(t.slice(0, 2).toUpperCase())}
            editable={admin}
            placeholderTextColor={colors.faint}
          />
          <Text style={styles.label}>Color</Text>
          <View style={styles.swatches}>
            {ICON_COLORS.map((c) => (
              <Pressable
                key={c}
                onPress={() => admin && setIconColor(c)}
                style={[styles.swatch, { backgroundColor: c }, iconColor === c && styles.swatchOn]}
              />
            ))}
          </View>
        </Glass>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  head: { marginHorizontal: 12, borderRadius: radii.lg },
  card: { padding: space.lg, borderRadius: radii.lg, gap: 8 },
  hint: { color: colors.muted, textAlign: "center" },
  err: { color: colors.pink },
  label: { color: colors.muted, fontWeight: "700", marginTop: 8 },
  input: {
    height: 48,
    borderRadius: radii.sm,
    paddingHorizontal: 12,
    color: colors.ink,
    backgroundColor: "rgba(0,0,0,0.22)",
    fontSize: 16,
  },
  swatches: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 6 },
  swatch: { width: 32, height: 32, borderRadius: 16 },
  swatchOn: { borderWidth: 3, borderColor: "#fff" },
});

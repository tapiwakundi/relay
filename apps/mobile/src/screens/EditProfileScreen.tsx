import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import * as ImagePicker from "expo-image-picker";
import { api } from "../lib/auth";
import { keys, queryClient } from "../lib/query";
import { useWorkspace } from "../lib/workspace";
import { Avatar } from "../ui/Avatar";
import { HeaderBtn } from "../ui/Header";
import { PageHeader, ScreenCanvas } from "../ui/SlackChrome";
import { colors, radii, space } from "../ui/theme";
import type { RootStackParamList } from "../nav/types";

type Props = NativeStackScreenProps<RootStackParamList, "EditProfile">;

export function EditProfileScreen({ navigation }: Props) {
  const { me } = useWorkspace();
  const [displayName, setDisplayName] = useState(me.displayName);
  const [title, setTitle] = useState(me.title ?? "");
  const [statusText, setStatusText] = useState(me.statusText ?? "");
  const [statusEmoji, setStatusEmoji] = useState(me.statusEmoji ?? "");
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    try {
      await api("/api/me", {
        method: "PATCH",
        body: JSON.stringify({ displayName, title: title || null, statusText: statusText || null, statusEmoji: statusEmoji || null }),
      });
      await queryClient.invalidateQueries({ queryKey: keys.me });
      navigation.goBack();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function pickPhoto() {
    const img = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.85 });
    if (img.canceled || !img.assets[0]) return;
    const asset = img.assets[0];
    const form = new FormData();
    form.append(
      "file",
      {
        uri: asset.uri,
        name: asset.fileName ?? "avatar.jpg",
        type: asset.mimeType ?? "image/jpeg",
      } as unknown as Blob,
    );
    await api("/api/me/photo", { method: "POST", body: form });
    await queryClient.invalidateQueries({ queryKey: keys.me });
  }

  return (
    <ScreenCanvas>
      <PageHeader
        title="Update profile"
        onBack={() => navigation.goBack()}
        right={<HeaderBtn label="Save" onPress={() => void save()} />}
      />
      <ScrollView contentContainerStyle={{ padding: space.md }}>
        <View style={styles.card}>
          <Pressable onPress={() => void pickPhoto()} style={{ alignSelf: "center" }}>
            <Avatar name={displayName} image={me.image} size={88} />
          </Pressable>
          <Text style={styles.hint}>Tap to change photo</Text>
          {error ? <Text style={styles.err}>{error}</Text> : null}
          <Field label="Display name" value={displayName} onChange={setDisplayName} />
          <Field label="Title" value={title} onChange={setTitle} />
          <Field label="Status emoji" value={statusEmoji} onChange={setStatusEmoji} />
          <Field label="Status" value={statusText} onChange={setStatusText} />
        </View>
      </ScrollView>
    </ScreenCanvas>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <TextInput style={styles.input} value={value} onChangeText={onChange} placeholderTextColor={colors.faint} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: space.lg, borderRadius: radii.lg, gap: 10 },
  hint: { color: colors.muted, textAlign: "center" },
  err: { color: colors.pink },
  label: { color: colors.muted, fontWeight: "700", marginBottom: 4 },
  input: {
    height: 48,
    borderRadius: radii.sm,
    paddingHorizontal: 12,
    color: colors.ink,
    backgroundColor: colors.inputFill,
    fontSize: 16,
  },
});

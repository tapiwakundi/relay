import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { api } from "../lib/auth";
import { keys, queryClient } from "../lib/query";
import { useWorkspace } from "../lib/workspace";
import { Glass } from "../ui/Glass";
import { IconHash } from "../ui/Icons";
import { PageHeader, ScreenCanvas } from "../ui/SlackChrome";
import { colors } from "../ui/theme";
import type { RootStackParamList } from "../nav/types";

type Props = NativeStackScreenProps<RootStackParamList, "NewChannel">;
type Step = "name" | "visibility";

function channelSlug(raw: string) {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9-\s]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

export function NewChannelScreen({ navigation }: Props) {
  const { workspace } = useWorkspace();
  const [step, setStep] = useState<Step>("name");
  const [name, setName] = useState("");
  const [isPrivate, setPrivate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const slug = name.replace(/^-+|-+$/g, "");
  const ready = slug.length > 0;

  async function create() {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { channel } = await api<{ channel: { id: string } }>("/api/channels", {
        method: "POST",
        body: JSON.stringify({ name: slug, isPrivate, workspaceId: workspace.id }),
      });
      await queryClient.invalidateQueries({ queryKey: keys.bootstrap(workspace.id) });
      navigation.replace("Channel", { channelId: channel.id });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <ScreenCanvas>
      <PageHeader
        title="Create a Channel"
        subtitle={step === "visibility" ? `#${slug}` : undefined}
        sheet
        back={step === "name" ? "close" : "back"}
        onBack={step === "name" ? () => navigation.goBack() : () => setStep("name")}
        right={
          step === "name" ? (
            <Pill label="Next" enabled={ready} onPress={() => setStep("visibility")} />
          ) : (
            <Pill label="Create" enabled={ready && !busy} onPress={() => void create()} />
          )
        }
      />

      {step === "name" ? (
        <View style={styles.body}>
          <Text style={styles.label}>Name</Text>
          <View style={styles.nameRow}>
            <Text style={styles.hash}>#</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={(value) => setName(channelSlug(value))}
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
              selectionColor={colors.aubergine}
              placeholder="project-pigeon"
              placeholderTextColor={colors.faint}
              returnKeyType="next"
              onSubmitEditing={() => {
                if (ready) setStep("visibility");
              }}
            />
          </View>
          <View style={styles.rule} />
          <Glass style={styles.help} variant="regular" fallback="light" colorScheme="light">
            <View style={styles.helpIco}>
              <IconHash size={16} color={colors.aubergine} />
            </View>
            <Text style={styles.helpTxt}>
              Channels are where conversations happen around a topic. Use a name that’s easy to find and understand.
            </Text>
          </Glass>
        </View>
      ) : (
        <View style={styles.body}>
          {error ? <Text style={styles.err}>{error}</Text> : null}
          <Text style={styles.visLabel}>Visibility</Text>
          <VisibilityOption
            title={`Public - Anyone in ${workspace.name}`}
            selected={!isPrivate}
            onPress={() => setPrivate(false)}
          />
          <VisibilityOption
            title="Private - Only specific people"
            detail="Can only be viewed or joined by invitation."
            selected={isPrivate}
            onPress={() => setPrivate(true)}
          />
        </View>
      )}
    </ScreenCanvas>
  );
}

function Pill({ label, enabled, onPress }: { label: string; enabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      disabled={!enabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ disabled: !enabled }}
      style={[styles.pill, enabled ? styles.pillOn : styles.pillOff]}
    >
      <Text style={[styles.pillTxt, enabled ? styles.pillTxtOn : styles.pillTxtOff]}>{label}</Text>
    </Pressable>
  );
}

function VisibilityOption({
  title,
  detail,
  selected,
  onPress,
}: {
  title: string;
  detail?: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.option} onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected }}>
      <View style={{ flex: 1 }}>
        <Text style={styles.optionTitle}>{title}</Text>
        {detail ? <Text style={styles.optionDetail}>{detail}</Text> : null}
      </View>
      <View style={[styles.radio, selected && styles.radioOn]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    minWidth: 72,
    height: 36,
    paddingHorizontal: 16,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  pillOn: { backgroundColor: colors.aubergine },
  pillOff: { backgroundColor: "rgba(120,120,128,0.16)" },
  pillTxt: { fontSize: 16, fontWeight: "700" },
  pillTxtOn: { color: "#fff" },
  pillTxtOff: { color: "#8E8E93" },
  body: { paddingHorizontal: 16, paddingTop: 8 },
  label: { color: colors.ink, fontSize: 16, fontWeight: "700", marginBottom: 10 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 36 },
  hash: { color: colors.ink, fontSize: 22, fontWeight: "500" },
  input: { flex: 1, color: colors.ink, fontSize: 22, paddingVertical: 4 },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: colors.hairline, marginTop: 6 },
  help: {
    marginTop: 18,
    borderRadius: 14,
    overflow: "hidden",
    padding: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    backgroundColor: "rgba(242,242,247,0.94)",
  },
  helpIco: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "rgba(26, 95, 180, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  helpTxt: { flex: 1, color: colors.muted, fontSize: 14, lineHeight: 20 },
  err: { color: colors.pink, marginBottom: 12 },
  visLabel: { color: colors.ink, fontSize: 16, fontWeight: "700", marginBottom: 18 },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingVertical: 14,
  },
  optionTitle: { color: colors.ink, fontSize: 16, fontWeight: "600" },
  optionDetail: { color: colors.muted, fontSize: 13, marginTop: 3, lineHeight: 18 },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: "#C7C7CC",
  },
  radioOn: {
    borderWidth: 6,
    borderColor: colors.aubergine,
  },
});

import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { wrapSelection } from "../lib/format";
import { colors, radii, space } from "./theme";
import { Glass } from "./Glass";

export function Composer({
  placeholder,
  onSend,
  onAttach,
  sending,
}: {
  placeholder: string;
  onSend: (body: string) => void;
  onAttach?: () => void;
  sending?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [sel, setSel] = useState({ start: 0, end: 0 });

  function wrap(before: string, after = before) {
    const next = wrapSelection(draft, sel.start, sel.end, before, after);
    setDraft(next.text);
  }

  function submit() {
    const body = draft.trim();
    if (!body || sending) return;
    setDraft("");
    onSend(body);
  }

  return (
    <Glass style={styles.wrap} variant="regular" interactive>
      <View style={styles.tools}>
        <Tool label="B" onPress={() => wrap("*")} />
        <Tool label="I" onPress={() => wrap("_")} />
        <Tool label="S" onPress={() => wrap("~")} />
        <Tool label="<>" onPress={() => wrap("`")} />
        {onAttach ? <Tool label="+" onPress={onAttach} /> : null}
      </View>
      <View style={styles.row}>
        <TextInput
          style={styles.input}
          placeholder={placeholder}
          placeholderTextColor={colors.faint}
          value={draft}
          onChangeText={setDraft}
          onSelectionChange={(e) => setSel(e.nativeEvent.selection)}
          multiline
          onSubmitEditing={submit}
        />
        <Pressable style={[styles.send, !draft.trim() && styles.sendOff]} onPress={submit} disabled={!draft.trim()}>
          <Text style={styles.sendTxt}>Send</Text>
        </Pressable>
      </View>
    </Glass>
  );
}

function Tool({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.tool}>
      <Text style={styles.toolTxt}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 8, borderRadius: radii.lg },
  tools: { flexDirection: "row", gap: 6, marginBottom: 6, paddingHorizontal: 4 },
  tool: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: radii.sm },
  toolTxt: { color: colors.ink, fontWeight: "800", fontSize: 13 },
  row: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    color: colors.ink,
    fontSize: 16,
    paddingHorizontal: space.sm,
    paddingVertical: 8,
  },
  send: {
    backgroundColor: colors.green,
    borderRadius: radii.pill,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  sendOff: { opacity: 0.4 },
  sendTxt: { color: "#fff", fontWeight: "800" },
});

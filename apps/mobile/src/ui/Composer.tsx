import { type ReactNode, useEffect, useRef, useState } from "react";
import {
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Feather, FontAwesome } from "@expo/vector-icons";
import { GlassView } from "expo-glass-effect";
import { EMOJI_QUICK } from "@relay/shared";
import { wrapSelection } from "../lib/format";
import { canUseLiquidGlass } from "./Glass";
import { colors } from "./theme";

export function Composer({
  placeholder,
  onSend,
  onAttach,
  onPickImage,
  sending,
  focusNonce,
  onFocus,
}: {
  placeholder: string;
  onSend: (body: string) => void;
  onAttach?: () => void;
  onPickImage?: () => void;
  sending?: boolean;
  focusNonce?: number;
  onFocus?: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [sel, setSel] = useState({ start: 0, end: 0 });
  const [focused, setFocused] = useState(false);
  const [formatOpen, setFormatOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expanded = focused || draft.trim().length > 0;
  const canSend = Boolean(draft.trim()) && !sending;
  const liquid = canUseLiquidGlass();

  useEffect(() => {
    if (!focusNonce) return;
    inputRef.current?.focus();
  }, [focusNonce]);

  useEffect(() => {
    return () => {
      if (blurTimer.current) clearTimeout(blurTimer.current);
    };
  }, []);

  const prevExpanded = useRef(expanded);
  useEffect(() => {
    if (prevExpanded.current === expanded) return;
    prevExpanded.current = expanded;
    if (Platform.OS === "ios") {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
    if (!expanded) {
      setFormatOpen(false);
      setEmojiOpen(false);
    }
  }, [expanded]);

  function keepFocus() {
    if (blurTimer.current) clearTimeout(blurTimer.current);
    inputRef.current?.focus();
  }

  function wrap(before: string, after = before) {
    keepFocus();
    const next = wrapSelection(draft, sel.start, sel.end, before, after);
    setDraft(next.text);
    setSel({ start: next.from, end: next.to });
  }

  function insertAtCursor(value: string) {
    keepFocus();
    const start = sel.start;
    const end = sel.end;
    setDraft(draft.slice(0, start) + value + draft.slice(end));
    const pos = start + value.length;
    setSel({ start: pos, end: pos });
  }

  function submit() {
    const body = draft.trim();
    if (!body || sending) return;
    setDraft("");
    setFormatOpen(false);
    setEmojiOpen(false);
    onSend(body);
  }

  function onInputFocus() {
    if (blurTimer.current) clearTimeout(blurTimer.current);
    setFocused(true);
    onFocus?.();
  }

  function onInputBlur() {
    blurTimer.current = setTimeout(() => setFocused(false), 160);
  }

  const inner = (
    <>
      <View style={expanded ? styles.inputRow : styles.idleRow}>
        <View style={[styles.idlePlusSlot, expanded && styles.idlePlusHidden]} pointerEvents={expanded ? "none" : "auto"}>
          {onAttach ? (
            <BarBtn label="Attach" onPress={onAttach}>
              <Feather name="plus" size={22} color={colors.muted} />
            </BarBtn>
          ) : null}
        </View>
        <TextInput
          ref={inputRef}
          style={expanded ? styles.input : styles.idleInput}
          placeholder={placeholder}
          placeholderTextColor={colors.faint}
          value={draft}
          onChangeText={setDraft}
          onSelectionChange={(e) => setSel(e.nativeEvent.selection)}
          onFocus={onInputFocus}
          onBlur={onInputBlur}
          multiline
          editable={!sending}
          cursorColor={colors.accent}
          selectionColor={colors.accent}
          onSubmitEditing={submit}
        />
      </View>
      {expanded && formatOpen ? (
        <View style={styles.formatRow}>
          <BarBtn label="Bold" onPress={() => wrap("*")}>
            <FontAwesome name="bold" size={16} color={colors.ink} />
          </BarBtn>
          <BarBtn label="Italic" onPress={() => wrap("_")}>
            <FontAwesome name="italic" size={16} color={colors.ink} />
          </BarBtn>
          <BarBtn label="Strikethrough" onPress={() => wrap("~")}>
            <FontAwesome name="strikethrough" size={16} color={colors.ink} />
          </BarBtn>
          <BarBtn label="Code" onPress={() => wrap("`")}>
            <FontAwesome name="code" size={16} color={colors.ink} />
          </BarBtn>
        </View>
      ) : null}
      {expanded && emojiOpen ? (
        <View style={styles.emojiRow}>
          {EMOJI_QUICK.map((emoji) => (
            <Pressable
              key={emoji}
              onPress={() => insertAtCursor(emoji)}
              style={styles.emojiHit}
              accessibilityLabel={emoji}
            >
              <Text style={styles.emoji}>{emoji}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <View
        style={[styles.toolbar, !expanded && styles.toolbarCollapsed]}
        pointerEvents={expanded ? "auto" : "none"}
        accessibilityElementsHidden={!expanded}
        importantForAccessibility={expanded ? "auto" : "no-hide-descendants"}
      >
        {onAttach ? (
          <Pressable onPress={onAttach} style={styles.plusCircle} accessibilityRole="button" accessibilityLabel="Attach">
            <Feather name="plus" size={20} color={colors.ink} />
          </Pressable>
        ) : null}
        <BarBtn
          label="Formatting"
          onPress={() => {
            keepFocus();
            setFormatOpen((open) => !open);
            setEmojiOpen(false);
          }}
        >
          <Text style={[styles.aa, formatOpen && styles.aaOn]}>Aa</Text>
        </BarBtn>
        <BarBtn
          label="Emoji"
          onPress={() => {
            keepFocus();
            setEmojiOpen((open) => !open);
            setFormatOpen(false);
          }}
        >
          <FontAwesome name="smile-o" size={20} color={emojiOpen ? colors.ink : colors.muted} />
        </BarBtn>
        <BarBtn label="Mention" onPress={() => insertAtCursor("@")}>
          <FontAwesome name="at" size={18} color={colors.muted} />
        </BarBtn>
        {onPickImage || onAttach ? (
          <BarBtn label="Photo" onPress={onPickImage ?? onAttach}>
            <FontAwesome name="picture-o" size={18} color={colors.muted} />
          </BarBtn>
        ) : null}
        <View style={{ flex: 1 }} />
        <BarBtn label="Send" onPress={submit} disabled={!canSend}>
          <FontAwesome name="send" size={16} color={canSend ? colors.accent : "#C7C7CC"} />
        </BarBtn>
      </View>
    </>
  );

  const shellStyle = [styles.shell, expanded && styles.shellExpanded];

  if (liquid) {
    return (
      <GlassView style={shellStyle} glassEffectStyle="clear" isInteractive colorScheme="light">
        {inner}
      </GlassView>
    );
  }

  return <View style={[shellStyle, styles.fallback]}>{inner}</View>;
}

function BarBtn({
  label,
  onPress,
  disabled,
  children,
}: {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || !onPress}
      style={[styles.barBtn, disabled && styles.barBtnOff]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shell: {
    borderRadius: 24,
    minHeight: 48,
    justifyContent: "center",
  },
  shellExpanded: {
    paddingTop: 10,
    paddingBottom: 4,
    minHeight: 96,
  },
  fallback: {
    backgroundColor: "rgba(255,255,255,0.92)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0,0,0,0.04)",
  },
  idleRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 48,
    paddingRight: 16,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  idlePlusSlot: {
    width: 44,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  idlePlusHidden: {
    width: 0,
    overflow: "hidden",
  },
  idleInput: {
    flex: 1,
    color: colors.ink,
    fontSize: 16,
    paddingVertical: 12,
    maxHeight: 46,
  },
  input: {
    flex: 1,
    minHeight: 28,
    maxHeight: 120,
    color: colors.ink,
    fontSize: 16,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  formatRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 8,
    paddingBottom: 2,
  },
  emojiRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingBottom: 4,
    gap: 4,
  },
  emojiHit: { padding: 4 },
  emoji: { fontSize: 22 },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 44,
    paddingLeft: 8,
    paddingRight: 6,
    gap: 2,
  },
  toolbarCollapsed: {
    height: 0,
    minHeight: 0,
    overflow: "hidden",
    opacity: 0,
  },
  plusCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(60,60,67,0.04)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 4,
  },
  barBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  barBtnOff: { opacity: 0.45 },
  aa: {
    color: colors.muted,
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  aaOn: { color: colors.ink },
});

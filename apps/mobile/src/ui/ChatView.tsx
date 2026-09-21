import { useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import {
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { type Channel, type ChatMessage } from "@relay/shared";
import { api } from "../lib/auth";
import { formatDay, formatStamp, formatTime, sameMinute } from "../lib/format";
import { keys } from "../lib/query";
import { sendMessage, useWorkspace } from "../lib/workspace";
import { Ionicons } from "@expo/vector-icons";
import { Avatar } from "./Avatar";
import { Composer } from "./Composer";
import { MessageBody } from "./MessageBody";
import { Sheet } from "./Sheet";
import { colors, radii } from "./theme";

const REACT_EMOJI = ["👍", "😂", "🔥", "👏", "🙌"] as const;
const MORE_EMOJI = ["❤️", "🎉", "👀", "✅"] as const;

export function ChatView({
  channel,
  parentId,
  onOpenThread,
  onOpenProfile,
  topInset = 0,
}: {
  channel: Channel;
  parentId: string | null;
  onOpenThread: (msg: ChatMessage) => void;
  onOpenProfile: (userId: string) => void;
  topInset?: number;
}) {
  const { me, members, sendWs } = useWorkspace();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const list = useRef<FlatList<ChatMessage>>(null);
  const [picked, setPicked] = useState<ChatMessage | null>(null);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [editBody, setEditBody] = useState("");
  const [moreActions, setMoreActions] = useState(false);
  const [moreEmoji, setMoreEmoji] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [focusNonce, setFocusNonce] = useState(0);

  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow", () => {
      setKeyboardOpen(true);
    });
    const hide = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide", () => {
      setKeyboardOpen(false);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const msgQ = useQuery({
    queryKey: keys.messages(channel.id, parentId),
    queryFn: () => api<{ messages: ChatMessage[] }>(`/api/channels/${channel.id}/messages${parentId ? `?parentId=${parentId}` : ""}`),
  });

  const parentQ = useQuery({
    queryKey: keys.message(parentId ?? ""),
    enabled: Boolean(parentId),
    initialData: parentId
      ? qc.getQueryData<{ messages: ChatMessage[] }>(keys.messages(channel.id, null))?.messages.find((m) => m.id === parentId)
      : undefined,
    queryFn: async () => {
      const { message } = await api<{ message: ChatMessage }>(`/api/messages/${parentId}`);
      return message;
    },
  });
  const parent = parentId ? (parentQ.data ?? null) : null;

  useEffect(() => {
    sendWs({ type: "subscribe", channelId: channel.id });
    return () => sendWs({ type: "unsubscribe", channelId: channel.id });
  }, [channel.id, sendWs]);

  const messages = msgQ.data?.messages ?? [];

  async function send(body: string, file?: { key: string; name: string; contentType: string }) {
    const clientId = globalThis.crypto?.randomUUID?.() ?? `c-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const optimistic: ChatMessage = {
      id: clientId,
      channelId: channel.id,
      parentId,
      userId: me.id,
      userName: me.displayName,
      userImage: me.image,
      userStatusEmoji: me.statusEmoji,
      body,
      createdAt: new Date().toISOString(),
      updatedAt: null,
      edited: false,
      replyCount: 0,
      latestReplyAt: null,
      replyUserIds: [],
      reactions: [],
      pending: true,
      clientId,
      fileKey: file?.key,
      fileName: file?.name,
      fileContentType: file?.contentType,
    };
    qc.setQueryData<{ messages: ChatMessage[] }>(keys.messages(channel.id, parentId), (old) => ({
      messages: [...(old?.messages ?? []), optimistic],
    }));
    try {
      await sendMessage({
        channelId: channel.id,
        body,
        parentId,
        clientId,
        fileKey: file?.key,
        fileName: file?.name,
        fileContentType: file?.contentType,
      });
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      qc.setQueryData<{ messages: ChatMessage[] }>(keys.messages(channel.id, parentId), (old) => ({
        messages: (old?.messages ?? []).map((m) => (m.clientId === clientId ? { ...m, failed: true, pending: false } : m)),
      }));
    }
  }

  async function uploadAndSend(uri: string, name: string, type: string) {
    const form = new FormData();
    form.append("file", { uri, name, type } as unknown as Blob);
    const uploaded = await api<{ key: string; name: string; contentType: string }>("/api/files", {
      method: "POST",
      body: form,
    });
    await send(name, { key: uploaded.key, name: uploaded.name, contentType: uploaded.contentType });
  }

  async function attach() {
    const doc = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    if (doc.canceled || !doc.assets?.[0]) return;
    const asset = doc.assets[0];
    await uploadAndSend(asset.uri, asset.name, asset.mimeType ?? "application/octet-stream");
  }

  async function pickImage() {
    const img = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.85 });
    if (img.canceled || !img.assets[0]) return;
    const asset = img.assets[0];
    await uploadAndSend(asset.uri, asset.fileName ?? "image.jpg", asset.mimeType ?? "image/jpeg");
  }

  async function react(msg: ChatMessage, emoji: string) {
    const res = await api<{ message: ChatMessage }>(`/api/messages/${msg.id}/reactions`, {
      method: "POST",
      body: JSON.stringify({ emoji }),
    });
    qc.setQueryData(keys.message(msg.id), res.message);
    setPicked(null);
  }

  async function saveLater(msg: ChatMessage) {
    await api(`/api/messages/${msg.id}/later`, { method: "POST" });
    void qc.invalidateQueries({ queryKey: ["later"] });
    setPicked(null);
  }

  async function remove(msg: ChatMessage) {
    await api(`/api/messages/${msg.id}`, { method: "DELETE" });
    setPicked(null);
  }

  async function saveEdit() {
    if (!editing) return;
    await api(`/api/messages/${editing.id}`, { method: "PATCH", body: JSON.stringify({ body: editBody }) });
    setEditing(null);
  }

  const memberMap = useMemo(() => new Map(members.map((m) => [m.userId, m])), [members]);
  const [composerH, setComposerH] = useState(72);

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <FlatList
        ref={list}
        data={messages}
        keyExtractor={(m) => m.id}
        style={[styles.listFill, { marginBottom: -composerH }]}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: composerH + 12, flexGrow: 1 },
          topInset ? { paddingTop: topInset } : null,
        ]}
        onContentSizeChange={() => {
          if (parentId) return;
          list.current?.scrollToEnd({ animated: false });
        }}
        ListHeaderComponent={
          parent ? (
            <ThreadHero
              msg={parent}
              member={memberMap.get(parent.userId)}
              onProfile={() => onOpenProfile(parent.userId)}
              onReact={() => setPicked(parent)}
              onReply={() => setFocusNonce((n) => n + 1)}
              onSave={() => void saveLater(parent)}
              onForward={() => {
                void Share.share({ message: parent.body });
              }}
              onMore={() => setPicked(parent)}
              onToggleReaction={(emoji) => void react(parent, emoji)}
            />
          ) : null
        }
        renderItem={({ item, index }) => {
          const prev = messages[index - 1];
          const compact = prev && prev.userId === item.userId && sameMinute(prev.createdAt, item.createdAt);
          const dayBreak = !prev || formatDay(prev.createdAt) !== formatDay(item.createdAt);
          const member = memberMap.get(item.userId);
          return (
            <View>
              {dayBreak ? (
                <View style={styles.day}>
                  <Text style={styles.dayTxt}>{formatDay(item.createdAt)}</Text>
                </View>
              ) : null}
              <Pressable
                onPress={() => {
                  if (parentId || item.pending || item.failed) return;
                  onOpenThread(item);
                }}
                onLongPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  setPicked(item);
                }}
                delayLongPress={350}
                style={[styles.msg, compact && styles.msgCompact, item.failed && styles.failed]}
              >
                {compact ? (
                  <View style={{ width: 36 }} />
                ) : (
                  <Avatar
                    name={item.userName}
                    image={item.userImage}
                    size={36}
                    presence={member?.presence}
                    onPress={() => onOpenProfile(item.userId)}
                  />
                )}
                <View style={{ flex: 1 }}>
                  {compact ? null : (
                    <View style={styles.meta}>
                      <Pressable onPress={() => onOpenProfile(item.userId)}>
                        <Text style={styles.name}>{item.userName}</Text>
                      </Pressable>
                      <Text style={styles.time}>{formatTime(item.createdAt)}</Text>
                      {item.pending ? <Text style={styles.time}>Sending…</Text> : null}
                      {item.edited ? <Text style={styles.time}>(edited)</Text> : null}
                    </View>
                  )}
                  {item.deleted ? <Text style={styles.time}>This message was deleted</Text> : <MessageBody body={item.body} />}
                  {!item.deleted && item.fileName ? <Text style={styles.file}>📎 {item.fileName}</Text> : null}
                  {item.reactions.length ? (
                    <View style={styles.rxns}>
                      {item.reactions.map((r) => (
                        <Pressable key={r.emoji} style={styles.rxn} onPress={() => void react(item, r.emoji)}>
                          <Text style={styles.rxnTxt}>
                            {r.emoji} {r.count}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                  {item.replyCount > 0 && !parentId ? (
                    <Pressable onPress={() => onOpenThread(item)}>
                      <Text style={styles.thread}>
                        {item.replyCount} {item.replyCount === 1 ? "reply" : "replies"}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              </Pressable>
            </View>
          );
        }}
      />
      <View
        pointerEvents="box-none"
        style={[styles.composer, { paddingBottom: keyboardOpen ? 10 : Math.max(insets.bottom, 10) }]}
        onLayout={(e) => {
          const next = Math.ceil(e.nativeEvent.layout.height);
          if (next > 0 && Math.abs(next - composerH) > 1) setComposerH(next);
        }}
      >
        <Composer
          placeholder={parentId ? "Add a reply" : `Message ${channel.isDm ? channel.dmName ?? channel.name : "#" + channel.name}`}
          onSend={(body) => void send(body)}
          onAttach={() => void attach()}
          onPickImage={() => void pickImage()}
          focusNonce={focusNonce}
        />
      </View>

      <Sheet
        open={Boolean(picked)}
        onClose={() => {
          setPicked(null);
          setMoreActions(false);
          setMoreEmoji(false);
        }}
      >
        <View style={styles.emojiRow}>
          {(moreEmoji ? [...REACT_EMOJI, ...MORE_EMOJI] : REACT_EMOJI).map((e) => (
            <Pressable
              key={e}
              onPress={() => picked && void react(picked, e)}
              style={styles.emojiBubble}
            >
              <Text style={styles.emojiGlyph}>{e}</Text>
            </Pressable>
          ))}
          <Pressable
            onPress={() => setMoreEmoji((v) => !v)}
            style={styles.emojiBubble}
            accessibilityLabel="More emoji"
          >
            <Ionicons name={moreEmoji ? "remove" : "add"} size={22} color={colors.ink} />
          </Pressable>
        </View>
        <View style={styles.tileRow}>
          {picked && !parentId ? (
            <Tile
              icon="chatbubble-outline"
              label="Reply"
              onPress={() => {
                onOpenThread(picked);
                setPicked(null);
              }}
            />
          ) : null}
          {picked ? (
            <Tile
              icon="arrow-redo-outline"
              label="Forward"
              onPress={() => {
                void Share.share({ message: picked.body });
                setPicked(null);
              }}
            />
          ) : null}
          <Tile
            icon="bookmark-outline"
            label="Save"
            onPress={() => picked && void saveLater(picked)}
          />
        </View>
        <View style={styles.divider} />
        {picked ? (
          <Row
            icon="copy-outline"
            label="Copy Message"
            onPress={() => {
              void Share.share({ message: picked.body });
              setPicked(null);
            }}
          />
        ) : null}
        {picked ? (
          <Row
            icon="person-outline"
            label="View profile"
            onPress={() => {
              onOpenProfile(picked.userId);
              setPicked(null);
            }}
          />
        ) : null}
        <Pressable
          onPress={() => setMoreActions((v) => !v)}
          style={styles.moreRow}
        >
          <Ionicons name="ellipsis-horizontal" size={20} color={colors.ink} />
          <Text style={styles.rowLabel}>More Actions</Text>
          <Ionicons name={moreActions ? "chevron-down" : "chevron-forward"} size={18} color={colors.faint} />
        </Pressable>
        {moreActions && picked?.userId === me.id ? (
          <>
            <Row
              icon="create-outline"
              label="Edit"
              onPress={() => {
                setEditing(picked);
                setEditBody(picked.body);
                setPicked(null);
                setMoreActions(false);
              }}
            />
            <Row
              icon="trash-outline"
              label="Delete"
              danger
              onPress={() => {
                Alert.alert("Delete message?", "This can’t be undone.", [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Delete",
                    style: "destructive",
                    onPress: () => picked && void remove(picked),
                  },
                ]);
              }}
            />
          </>
        ) : null}
      </Sheet>

      <Sheet open={Boolean(editing)} onClose={() => setEditing(null)} title="Edit message">
        <TextInput
          value={editBody}
          onChangeText={setEditBody}
          style={styles.edit}
          multiline
          placeholderTextColor={colors.faint}
        />
        <Pressable style={styles.save} onPress={() => void saveEdit()}>
          <Text style={styles.saveTxt}>Save</Text>
        </Pressable>
      </Sheet>
    </KeyboardAvoidingView>
  );
}

function ThreadHero({
  msg,
  member,
  onProfile,
  onReact,
  onReply,
  onSave,
  onForward,
  onMore,
  onToggleReaction,
}: {
  msg: ChatMessage;
  member?: { presence?: string | null };
  onProfile: () => void;
  onReact: () => void;
  onReply: () => void;
  onSave: () => void;
  onForward: () => void;
  onMore: () => void;
  onToggleReaction: (emoji: string) => void;
}) {
  return (
    <View style={styles.hero}>
      <Pressable
        onLongPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          onMore();
        }}
        delayLongPress={350}
        style={styles.msg}
      >
        <Avatar name={msg.userName} image={msg.userImage} size={36} presence={member?.presence} onPress={onProfile} />
        <View style={{ flex: 1 }}>
          <View style={styles.meta}>
            <Pressable onPress={onProfile}>
              <Text style={styles.name}>{msg.userName}</Text>
            </Pressable>
            <Text style={styles.time}>{formatStamp(msg.createdAt)}</Text>
            {msg.edited ? <Text style={styles.time}>(edited)</Text> : null}
          </View>
          {msg.deleted ? <Text style={styles.time}>This message was deleted</Text> : <MessageBody body={msg.body} />}
          {!msg.deleted && msg.fileName ? <Text style={styles.file}>📎 {msg.fileName}</Text> : null}
          {msg.reactions.length ? (
            <View style={styles.rxns}>
              {msg.reactions.map((r) => (
                <Pressable key={r.emoji} style={styles.rxn} onPress={() => onToggleReaction(r.emoji)}>
                  <Text style={styles.rxnTxt}>
                    {r.emoji} {r.count}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      </Pressable>
      <Pressable onPress={onReact} style={styles.addReact} accessibilityLabel="Add reaction">
        <Ionicons name="happy-outline" size={18} color={colors.muted} />
      </Pressable>
      <View style={styles.threadBar}>
        <Pressable onPress={onReply} style={styles.threadBarHit} accessibilityLabel="Reply in thread">
          <Ionicons name="chatbubble-outline" size={18} color={colors.ink} />
          <Text style={styles.threadBarLabel}>Reply in Thread</Text>
        </Pressable>
        <Pressable onPress={onSave} hitSlop={8} accessibilityLabel="Save">
          <Ionicons name="bookmark-outline" size={20} color={colors.ink} />
        </Pressable>
        <Pressable onPress={onForward} hitSlop={8} accessibilityLabel="Forward">
          <Ionicons name="share-outline" size={20} color={colors.ink} />
        </Pressable>
        <Pressable onPress={onMore} hitSlop={8} accessibilityLabel="More">
          <Ionicons name="ellipsis-horizontal" size={20} color={colors.ink} />
        </Pressable>
      </View>
    </View>
  );
}

function Tile({
  icon,
  label,
  onPress,
}: {
  icon: ComponentProps<typeof Ionicons>["name"];
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.tile}>
      <Ionicons name={icon} size={22} color={colors.ink} />
      <Text style={styles.tileLabel}>{label}</Text>
    </Pressable>
  );
}

function Row({
  icon,
  label,
  onPress,
  danger,
}: {
  icon: ComponentProps<typeof Ionicons>["name"];
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <Pressable onPress={onPress} style={styles.rowItem}>
      <Ionicons name={icon} size={20} color={danger ? colors.pink : colors.ink} />
      <Text style={[styles.rowLabel, danger && { color: colors.pink }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  listFill: { flex: 1, backgroundColor: colors.canvas },
  list: { padding: 12, paddingBottom: 24, backgroundColor: colors.canvas },
  day: { alignItems: "center", marginVertical: 10 },
  dayTxt: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  msg: { flexDirection: "row", gap: 10, marginBottom: 10 },
  msgCompact: { marginBottom: 2, marginTop: -6 },
  failed: { opacity: 0.55 },
  meta: { flexDirection: "row", alignItems: "baseline", gap: 8, marginBottom: 2 },
  name: { color: colors.ink, fontWeight: "800", fontSize: 15 },
  time: { color: colors.faint, fontSize: 12 },
  file: { color: colors.accent, marginTop: 6, fontWeight: "700" },
  rxns: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
  rxn: {
    backgroundColor: colors.inputFill,
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  rxnTxt: { color: colors.ink, fontSize: 13 },
  thread: { color: colors.accent, fontWeight: "700", marginTop: 6 },
  composer: { paddingHorizontal: 14, zIndex: 10 },
  hero: { marginBottom: 8 },
  addReact: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.inputFill,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
    marginLeft: 46,
  },
  threadBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    marginTop: 12,
    marginHorizontal: -12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
  },
  threadBarHit: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  threadBarLabel: { color: colors.ink, fontSize: 16, fontWeight: "600" },
  emojiRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
    gap: 8,
    flexWrap: "wrap",
  },
  emojiBubble: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.inputFill,
    alignItems: "center",
    justifyContent: "center",
  },
  emojiGlyph: { fontSize: 24 },
  tileRow: { flexDirection: "row", gap: 10, marginBottom: 8 },
  tile: {
    flex: 1,
    backgroundColor: colors.inputFill,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    gap: 8,
  },
  tileLabel: { color: colors.ink, fontSize: 13, fontWeight: "600" },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.hairline,
    marginVertical: 4,
  },
  rowItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  moreRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  rowLabel: { flex: 1, color: colors.ink, fontSize: 16, fontWeight: "500" },
  edit: {
    minHeight: 80,
    color: colors.ink,
    fontSize: 16,
    backgroundColor: colors.inputFill,
    borderRadius: 12,
    padding: 10,
  },
  save: {
    marginTop: 12,
    backgroundColor: colors.green,
    borderRadius: radii.pill,
    alignItems: "center",
    paddingVertical: 12,
  },
  saveTxt: { color: "#fff", fontWeight: "800" },
});

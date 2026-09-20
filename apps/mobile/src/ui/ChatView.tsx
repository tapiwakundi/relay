import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  FlatList,
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
import * as DocumentPicker from "expo-document-picker";
import * as Haptics from "expo-haptics";
import { EMOJI_QUICK, type Channel, type ChatMessage } from "@relay/shared";
import { api } from "../lib/auth";
import { formatDay, formatTime, sameMinute } from "../lib/format";
import { keys } from "../lib/query";
import { sendMessage, useWorkspace } from "../lib/workspace";
import { Avatar } from "./Avatar";
import { Composer } from "./Composer";
import { MessageBody } from "./MessageBody";
import { Sheet } from "./Sheet";
import { colors, radii } from "./theme";

export function ChatView({
  channel,
  parentId,
  onOpenThread,
  onOpenProfile,
}: {
  channel: Channel;
  parentId: string | null;
  onOpenThread: (msg: ChatMessage) => void;
  onOpenProfile: (userId: string) => void;
}) {
  const { me, members, sendWs } = useWorkspace();
  const qc = useQueryClient();
  const list = useRef<FlatList<ChatMessage>>(null);
  const [picked, setPicked] = useState<ChatMessage | null>(null);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [editBody, setEditBody] = useState("");

  const msgQ = useQuery({
    queryKey: keys.messages(channel.id, parentId),
    queryFn: () => api<{ messages: ChatMessage[] }>(`/api/channels/${channel.id}/messages${parentId ? `?parentId=${parentId}` : ""}`),
  });

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

  async function attach() {
    const doc = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    if (doc.canceled || !doc.assets?.[0]) return;
    const asset = doc.assets[0];
    const form = new FormData();
    form.append(
      "file",
      { uri: asset.uri, name: asset.name, type: asset.mimeType ?? "application/octet-stream" } as unknown as Blob,
    );
    const uploaded = await api<{ key: string; name: string; contentType: string }>("/api/files", {
      method: "POST",
      body: form,
    });
    await send(asset.name, { key: uploaded.key, name: uploaded.name, contentType: uploaded.contentType });
  }

  async function react(msg: ChatMessage, emoji: string) {
    await api(`/api/messages/${msg.id}/reactions`, { method: "POST", body: JSON.stringify({ emoji }) });
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

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <FlatList
        ref={list}
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.list}
        onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })}
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
                onLongPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  setPicked(item);
                }}
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
      <View style={styles.composer}>
        <Composer
          placeholder={`Message ${channel.isDm ? channel.dmName ?? channel.name : "#" + channel.name}`}
          onSend={(body) => void send(body)}
          onAttach={() => void attach()}
        />
      </View>

      <Sheet open={Boolean(picked)} onClose={() => setPicked(null)} title="Message">
        <View style={styles.emojiRow}>
          {EMOJI_QUICK.map((e) => (
            <Pressable key={e} onPress={() => picked && void react(picked, e)} style={styles.emoji}>
              <Text style={{ fontSize: 26 }}>{e}</Text>
            </Pressable>
          ))}
        </View>
        {picked && !parentId ? (
          <Action label="Reply in thread" onPress={() => { onOpenThread(picked); setPicked(null); }} />
        ) : null}
        <Action label="Save for later" onPress={() => picked && void saveLater(picked)} />
        {picked ? (
          <Action
            label="Copy"
            onPress={() => {
              void Share.share({ message: picked.body });
              setPicked(null);
            }}
          />
        ) : null}
        {picked?.userId === me.id ? (
          <Action
            label="Edit"
            onPress={() => {
              setEditing(picked);
              setEditBody(picked.body);
              setPicked(null);
            }}
          />
        ) : null}
        {picked?.userId === me.id ? (
          <Action
            label="Delete"
            danger
            onPress={() => {
              Alert.alert("Delete message?", "This can’t be undone.", [
                { text: "Cancel", style: "cancel" },
                { text: "Delete", style: "destructive", onPress: () => picked && void remove(picked) },
              ]);
            }}
          />
        ) : null}
        {picked ? <Action label="View profile" onPress={() => { onOpenProfile(picked.userId); setPicked(null); }} /> : null}
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

function Action({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable onPress={onPress} style={styles.action}>
      <Text style={[styles.actionTxt, danger && { color: colors.pink }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { padding: 12, paddingBottom: 24 },
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
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  rxnTxt: { color: colors.ink, fontSize: 13 },
  thread: { color: colors.accent, fontWeight: "700", marginTop: 6 },
  composer: { paddingHorizontal: 10, paddingBottom: 10 },
  emojiRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  emoji: { padding: 4 },
  action: { paddingVertical: 12 },
  actionTxt: { color: colors.ink, fontSize: 17, fontWeight: "600" },
  edit: {
    minHeight: 80,
    color: colors.ink,
    fontSize: 16,
    backgroundColor: "rgba(0,0,0,0.2)",
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

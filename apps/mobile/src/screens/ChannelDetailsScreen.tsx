import { useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { channelMembers, channelTitle, formatCreatedOn, membersNotInChannel, sectionAfterStar } from "@relay/chat";
import type { Channel, ChannelDetails as ChannelDetailsPayload, Member } from "@relay/shared";
import { api } from "../lib/auth";
import { joinHuddleCall } from "../lib/huddle-call";
import { queryClient as appQueryClient, type Bootstrap } from "../lib/query";
import { useWorkspace } from "../lib/workspace";
import { Avatar } from "../ui/Avatar";
import { ScreenCanvas } from "../ui/SlackChrome";
import { colors, radii, space } from "../ui/theme";
import type { RootStackParamList } from "../nav/types";

type Props = NativeStackScreenProps<RootStackParamList, "ChannelDetails">;
type Tab = "about" | "members";
type Field = "name" | "topic" | "description";

export function ChannelDetailsScreen({ navigation, route }: Props) {
  const qc = useQueryClient();
  const { channelById, members, me } = useWorkspace();
  const channel = channelById(route.params.channelId);
  const [tab, setTab] = useState<Tab>("about");
  const [editing, setEditing] = useState<Field | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [onlineOnly, setOnlineOnly] = useState(false);

  const detailsQ = useQuery({
    queryKey: ["channel-details", route.params.channelId],
    queryFn: () => api<ChannelDetailsPayload>(`/api/channels/${route.params.channelId}/details`),
    enabled: Boolean(channel),
  });

  if (!channel) {
    return (
      <ScreenCanvas>
        <Text style={styles.miss}>Channel missing</Text>
      </ScreenCanvas>
    );
  }

  const details = detailsQ.data;
  const memberIds = details?.memberIds ?? [];
  const createdBy = details?.createdBy ?? null;
  const conversation = channel.isDm || channel.isMpim;
  const title = channelTitle(channel);

  function remember(next: Channel) {
    appQueryClient.setQueriesData<Bootstrap>({ queryKey: ["bootstrap"] }, (boot) => {
      if (!boot) return boot;
      return { ...boot, channels: boot.channels.map((c) => (c.id === next.id ? { ...c, ...next } : c)) };
    });
  }

  function rememberDetails(next: ChannelDetailsPayload) {
    qc.setQueryData(["channel-details", channel!.id], next);
    remember(next.channel);
  }

  async function saveField() {
    if (!editing || !channel) return;
    setBusy(true);
    try {
      const next = await api<ChannelDetailsPayload>(`/api/channels/${channel.id}`, {
        method: "PATCH",
        body: JSON.stringify({ [editing]: draft }),
      });
      rememberDetails(next);
      setEditing(null);
    } catch (err) {
      Alert.alert("Couldn't save", err instanceof Error ? err.message : "Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleStar() {
    if (!channel) return;
    const res = await api<{ isStarred: boolean }>(`/api/channels/${channel.id}/star`, { method: "POST" });
    remember({
      ...channel,
      isStarred: res.isStarred,
      section: sectionAfterStar(channel, res.isStarred),
    });
  }

  async function toggleMute() {
    if (!channel) return;
    const res = await api<{ channel: Channel }>(`/api/channels/${channel.id}/mute`, { method: "POST" });
    remember(res.channel);
  }

  function chooseMute() {
    if (!channel) return;
    Alert.alert("Notifications", undefined, [
      {
        text: "All new posts",
        onPress: () => {
          if (!channel.isMuted) return;
          void toggleMute();
        },
      },
      {
        text: "Nothing",
        onPress: () => {
          if (channel.isMuted) return;
          void toggleMute();
        },
      },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  async function addPerson(userId: string) {
    if (!channel) return;
    setBusy(true);
    try {
      const next = await api<ChannelDetailsPayload>(`/api/channels/${channel.id}/members`, {
        method: "POST",
        body: JSON.stringify({ userId }),
      });
      rememberDetails(next);
    } catch (err) {
      Alert.alert("Couldn't add them", err instanceof Error ? err.message : "Try again.");
    } finally {
      setBusy(false);
    }
  }

  function leave() {
    if (!channel) return;
    Alert.alert(`Leave ${title}?`, "You will stop seeing this channel.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Leave",
        style: "destructive",
        onPress: () => {
          void (async () => {
            try {
              await api(`/api/channels/${channel.id}/leave`, { method: "POST" });
              appQueryClient.setQueriesData<Bootstrap>({ queryKey: ["bootstrap"] }, (boot) => {
                if (!boot) return boot;
                return { ...boot, channels: boot.channels.filter((c) => c.id !== channel.id) };
              });
              navigation.popToTop();
            } catch (err) {
              Alert.alert("Couldn't leave", err instanceof Error ? err.message : "Try again.");
            }
          })();
        },
      },
    ]);
  }

  async function huddle() {
    if (!channel) return;
    try {
      const inHuddle = channel.huddle?.participants.some((p) => p.userId === me.id);
      if (!inHuddle) await joinHuddleCall(channel.id);
      navigation.navigate("Huddle", { channelId: channel.id });
    } catch (err) {
      Alert.alert("Couldn't join the huddle", err instanceof Error ? err.message : "Try again.");
    }
  }

  const createdLabel = details ? formatCreatedOn(details.createdAt) : "";

  return (
    <ScreenCanvas>
      <View style={styles.head}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8} accessibilityLabel="Close">
          <Ionicons name="close" size={26} color={colors.ink} />
        </Pressable>
      </View>
      <View style={styles.tools}>
        <Pressable style={styles.pill} onPress={() => void toggleStar()} accessibilityLabel="Star channel">
          <Ionicons name={channel.isStarred ? "star" : "star-outline"} size={16} color={channel.isStarred ? colors.yellow : colors.ink} />
        </Pressable>
        <Pressable style={styles.pill} onPress={chooseMute}>
          <Ionicons name="notifications-outline" size={16} color={colors.ink} />
          <Text style={styles.pillTxt}>{channel.isMuted ? "Nothing" : "All new posts"}</Text>
        </Pressable>
        <Pressable style={styles.pill} onPress={() => void huddle()}>
          <Ionicons name="headset-outline" size={16} color={colors.ink} />
          <Text style={styles.pillTxt}>Huddle</Text>
        </Pressable>
      </View>
      <View style={styles.tabs}>
        <TabButton label="About" on={tab === "about"} onPress={() => setTab("about")} />
        <TabButton
          label={`Members ${details ? memberIds.length : channel.memberCount}`}
          on={tab === "members"}
          onPress={() => setTab("members")}
        />
      </View>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {tab === "about" ? (
          <>
            <View style={styles.card}>
              <FieldRow
                label="Channel name"
                value={channel.isDm ? channel.name : `# ${channel.name}`}
                editing={editing === "name"}
                draft={draft}
                busy={busy}
                canEdit={!conversation}
                onEdit={() => {
                  setEditing("name");
                  setDraft(channel.name);
                }}
                onDraft={setDraft}
                onSave={() => void saveField()}
                onCancel={() => setEditing(null)}
              />
              <FieldRow
                label="Topic"
                value={channel.topic || ""}
                placeholder="Add a topic"
                editing={editing === "topic"}
                draft={draft}
                busy={busy}
                canEdit
                onEdit={() => {
                  setEditing("topic");
                  setDraft(channel.topic || "");
                }}
                onDraft={setDraft}
                onSave={() => void saveField()}
                onCancel={() => setEditing(null)}
              />
              <FieldRow
                label="Description"
                value={channel.description || ""}
                placeholder="Add a description"
                editing={editing === "description"}
                draft={draft}
                busy={busy}
                canEdit
                multiline
                onEdit={() => {
                  setEditing("description");
                  setDraft(channel.description || "");
                }}
                onDraft={setDraft}
                onSave={() => void saveField()}
                onCancel={() => setEditing(null)}
              />
              {createdBy ? (
                <View style={styles.row}>
                  <Text style={styles.label}>Managed by</Text>
                  <Pressable onPress={() => navigation.navigate("Profile", { userId: createdBy.userId })}>
                    <Text style={styles.link}>{createdBy.name}</Text>
                  </Pressable>
                </View>
              ) : null}
              {createdBy ? (
                <View style={styles.row}>
                  <Text style={styles.label}>Created by</Text>
                  <Text style={styles.value}>
                    {createdBy.name} on {createdLabel}
                  </Text>
                </View>
              ) : null}
              {conversation ? null : (
                <View style={styles.row}>
                  <Pressable onPress={leave}>
                    <Text style={styles.leave}>Leave channel</Text>
                  </Pressable>
                </View>
              )}
            </View>
            <Pressable style={styles.idRow} onPress={() => void Share.share({ message: channel.id })}>
              <Text style={styles.idTxt}>Channel ID: {channel.id}</Text>
              <Ionicons name="copy-outline" size={16} color={colors.muted} />
            </Pressable>
          </>
        ) : (
          <MembersTab
            members={members}
            memberIds={memberIds}
            meId={me.id}
            createdById={createdBy?.userId ?? null}
            query={query}
            onlineOnly={onlineOnly}
            adding={adding}
            busy={busy}
            conversation={conversation}
            loading={detailsQ.isPending}
            onQuery={setQuery}
            onOnline={() => setOnlineOnly((v) => !v)}
            onToggleAdd={() => setAdding((v) => !v)}
            onAdd={(userId) => void addPerson(userId)}
            onOpen={(userId) => navigation.navigate("Profile", { userId })}
          />
        )}
      </ScrollView>
    </ScreenCanvas>
  );
}

function MembersTab({
  members,
  memberIds,
  meId,
  createdById,
  query,
  onlineOnly,
  adding,
  busy,
  conversation,
  loading,
  onQuery,
  onOnline,
  onToggleAdd,
  onAdd,
  onOpen,
}: {
  members: Member[];
  memberIds: string[];
  meId: string;
  createdById: string | null;
  query: string;
  onlineOnly: boolean;
  adding: boolean;
  busy: boolean;
  conversation: boolean;
  loading: boolean;
  onQuery: (value: string) => void;
  onOnline: () => void;
  onToggleAdd: () => void;
  onAdd: (userId: string) => void;
  onOpen: (userId: string) => void;
}) {
  const people = channelMembers(members, memberIds, { query, onlineOnly });
  const outsiders = membersNotInChannel(members, memberIds);

  return (
    <View>
      <View style={styles.find}>
        <View style={styles.search}>
          <Ionicons name="search" size={16} color={colors.muted} />
          <TextInput
            value={query}
            onChangeText={onQuery}
            placeholder="Find people"
            placeholderTextColor={colors.faint}
            style={styles.searchInput}
          />
        </View>
        <Pressable style={styles.filter} onPress={onOnline}>
          <Text style={styles.pillTxt}>{onlineOnly ? "Online" : "All"}</Text>
          <Ionicons name="chevron-down" size={14} color={colors.ink} />
        </Pressable>
      </View>
      {conversation ? null : (
        <Pressable style={styles.person} onPress={onToggleAdd}>
          <View style={styles.addIco}>
            <Ionicons name="person-add" size={18} color={colors.accent} />
          </View>
          <Text style={styles.personName}>Add people</Text>
        </Pressable>
      )}
      {adding
        ? outsiders.map((m) => (
            <Pressable key={m.userId} style={styles.person} disabled={busy} onPress={() => onAdd(m.userId)}>
              <Avatar name={m.displayName} image={m.image} size={36} />
              <Text style={styles.personName}>{m.displayName}</Text>
            </Pressable>
          ))
        : null}
      {loading ? <Text style={styles.muted}>Loading members…</Text> : null}
      {people.map((m) => (
        <Pressable key={m.userId} style={styles.person} onPress={() => onOpen(m.userId)}>
          <Avatar name={m.displayName} image={m.image} size={36} presence={m.presence} />
          <Text style={styles.personName}>
            {m.displayName}
            {m.userId === meId ? <Text style={styles.you}> (you)</Text> : null}
          </Text>
          {createdById === m.userId ? <Text style={styles.badge}>Channel Manager</Text> : null}
        </Pressable>
      ))}
    </View>
  );
}

function FieldRow({
  label,
  value,
  placeholder,
  editing,
  draft,
  busy,
  canEdit,
  multiline,
  onEdit,
  onDraft,
  onSave,
  onCancel,
}: {
  label: string;
  value: string;
  placeholder?: string;
  editing: boolean;
  draft: string;
  busy: boolean;
  canEdit: boolean;
  multiline?: boolean;
  onEdit: () => void;
  onDraft: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.label}>{label}</Text>
        {editing ? (
          <View style={styles.edit}>
            <TextInput
              value={draft}
              onChangeText={onDraft}
              style={[styles.input, multiline && styles.inputMulti]}
              multiline={multiline}
              autoFocus
              placeholderTextColor={colors.faint}
            />
            <Pressable onPress={onSave} disabled={busy}>
              <Text style={styles.link}>Save</Text>
            </Pressable>
            <Pressable onPress={onCancel}>
              <Text style={styles.muted}>Cancel</Text>
            </Pressable>
          </View>
        ) : (
          <Text style={[styles.value, !value && styles.placeholder]}>{value || placeholder}</Text>
        )}
      </View>
      {canEdit && !editing ? (
        <Pressable onPress={onEdit}>
          <Text style={styles.link}>Edit</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function TabButton({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.tab, on && styles.tabOn]}>
      <Text style={[styles.tabTxt, on && styles.tabTxtOn]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  miss: { color: colors.ink, padding: 24 },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.md,
    paddingTop: space.lg,
    gap: 12,
  },
  title: { flex: 1, color: colors.ink, fontSize: 28, fontWeight: "900", letterSpacing: -0.4 },
  tools: { flexDirection: "row", gap: 8, paddingHorizontal: space.md, paddingTop: 12 },
  pill: {
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.hairline,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.canvas,
  },
  pillTxt: { color: colors.ink, fontWeight: "700", fontSize: 14 },
  tabs: { flexDirection: "row", gap: 18, paddingHorizontal: space.md, marginTop: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline },
  tab: { paddingBottom: 10, borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabOn: { borderBottomColor: colors.ink },
  tabTxt: { color: colors.muted, fontWeight: "700", fontSize: 15 },
  tabTxtOn: { color: colors.ink },
  body: { padding: space.md, paddingBottom: 40 },
  card: { borderWidth: 1, borderColor: colors.hairline, borderRadius: radii.md, overflow: "hidden" },
  row: { padding: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.hairline, flexDirection: "row", justifyContent: "space-between", gap: 12 },
  label: { color: colors.ink, fontWeight: "800", fontSize: 14, marginBottom: 4 },
  value: { color: colors.ink, fontSize: 15 },
  placeholder: { color: colors.faint },
  link: { color: colors.accent, fontWeight: "700", fontSize: 15 },
  leave: { color: colors.pink, fontWeight: "700", fontSize: 15 },
  muted: { color: colors.muted, fontSize: 14 },
  edit: { gap: 8, marginTop: 4 },
  input: { borderWidth: 1, borderColor: colors.hairline, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, color: colors.ink, fontSize: 15 },
  inputMulti: { minHeight: 72, textAlignVertical: "top" },
  idRow: { marginTop: 16, flexDirection: "row", alignItems: "center", gap: 8 },
  idTxt: { color: colors.muted, fontSize: 13, flex: 1 },
  find: { flexDirection: "row", gap: 8, marginBottom: 8 },
  search: { flex: 1, height: 40, borderWidth: 1, borderColor: colors.hairline, borderRadius: 8, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 8 },
  searchInput: { flex: 1, color: colors.ink, fontSize: 15, paddingVertical: 0 },
  filter: { height: 40, borderWidth: 1, borderColor: colors.hairline, borderRadius: 8, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 6 },
  person: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  personName: { color: colors.ink, fontWeight: "800", fontSize: 15, flexShrink: 1 },
  you: { color: colors.muted, fontWeight: "600" },
  addIco: { width: 36, height: 36, borderRadius: 8, backgroundColor: "#E8F5FA", alignItems: "center", justifyContent: "center" },
  badge: { marginLeft: "auto", borderWidth: 1, borderColor: colors.hairline, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, color: colors.muted, fontWeight: "700", fontSize: 13 },
});

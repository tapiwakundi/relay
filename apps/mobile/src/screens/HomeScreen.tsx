import { useMemo, useState, type ReactNode } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Channel } from "@relay/shared";
import { useAccounts } from "../lib/account-manager";
import { useWorkspace } from "../lib/workspace";
import { dmPeer } from "@relay/chat";
import { api } from "../lib/auth";
import { keys, queryClient } from "../lib/query";
import { Avatar } from "../ui/Avatar";
import { WorkspaceGlyph } from "../ui/Glyph";
import {
  IconBookmark,
  IconChat,
  IconHash,
  IconHeadphones,
  IconLock,
  IconStar,
  IconThreads,
} from "../ui/Icons";
import { FloatingWorkspaceChrome, ScreenCanvas, ScrollingHero, useCompactScroll } from "../ui/SlackChrome";
import { colors } from "../ui/theme";
import type { RootStackParamList } from "../nav/types";

export function HomeScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { me, workspace, workspaces, channels, members, selectWorkspace } = useWorkspace();
  const { accounts, activeAccountId, switchAccount } = useAccounts();
  const [switcher, setSwitcher] = useState(false);
  const { compact, onScroll, scrollEventThrottle } = useCompactScroll();
  const [starredOpen, setStarredOpen] = useState(true);
  const [channelsOpen, setChannelsOpen] = useState(true);
  const [dmsOpen, setDmsOpen] = useState(true);

  const starred = channels.filter((c) => c.isStarred && !c.isDm && !c.isMpim);
  const listed = channels.filter((c) => !c.isDm && !c.isMpim && !c.isStarred);
  const dms = channels.filter((c) => c.isDm || c.isMpim);
  const selfDm = dms.find((c) => c.isDm && !c.isMpim && (c.memberCount <= 1 || c.dmName === me.displayName));
  const otherDms = dms.filter((c) => c.id !== selfDm?.id);
  const liveHuddles = channels.filter((c) => c.huddle?.active);
  const threadNew = channels.filter((c) => !c.isDm && c.unreadCount > 0).length;
  const laterCount = 0;

  const otherAccounts = useMemo(
    () => accounts.filter((account) => account.id !== (activeAccountId ?? me.id)),
    [accounts, activeAccountId, me.id],
  );

  return (
    <ScreenCanvas>
      <ScrollView
        scrollEventThrottle={scrollEventThrottle}
        onScroll={onScroll}
        contentContainerStyle={{ paddingBottom: 120 + insets.bottom }}
      >
        <ScrollingHero title={workspace.name} chevron onTitlePress={() => setSwitcher(true)} />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tiles}>
          <Shortcut
            icon={<IconThreads color={colors.aubergine} size={26} />}
            label="Threads"
            sub={`${threadNew} new`}
            onPress={() => nav.navigate("Threads")}
          />
          <Shortcut
            icon={<IconHeadphones color={colors.aubergine} size={26} />}
            label="Huddles"
            sub={`${liveHuddles.length} live`}
            onPress={() => {
              const live = liveHuddles[0];
              if (!live) return;
              const joined = live.huddle?.participants.some((person) => person.userId === me.id);
              nav.navigate("Channel", { channelId: live.id });
              if (joined) nav.navigate("Huddle", { channelId: live.id });
            }}
          />
          <Shortcut
            icon={<IconBookmark color={colors.aubergine} size={26} />}
            label="Later"
            sub={`${laterCount} items`}
            onPress={() => nav.navigate("Later")}
          />
        </ScrollView>

        <Section
          icon={<IconStar color={colors.muted} size={14} />}
          title="Starred"
          open={starredOpen}
          onToggle={() => setStarredOpen((v) => !v)}
        >
          {starred.map((c) => (
            <ChannelRow key={c.id} channel={c} onPress={() => nav.navigate("Channel", { channelId: c.id })} />
          ))}
        </Section>

        <Section
          icon={<IconHash color={colors.muted} size={16} />}
          title="Channels"
          open={channelsOpen}
          onToggle={() => setChannelsOpen((v) => !v)}
        >
          {listed.map((c) => (
            <ChannelRow key={c.id} channel={c} onPress={() => nav.navigate("Channel", { channelId: c.id })} />
          ))}
          <Pressable style={styles.row} onPress={() => nav.navigate("NewChannel")}>
            <View style={styles.addIco}>
              <Text style={styles.addPlus}>+</Text>
            </View>
            <Text style={styles.addTxt}>Add channel</Text>
          </Pressable>
        </Section>

        <Section
          icon={<IconChat color={colors.muted} size={16} />}
          title="Direct Messages"
          open={dmsOpen}
          onToggle={() => setDmsOpen((v) => !v)}
        >
          <DmRow
            name={me.displayName}
            image={me.image}
            presence={me.presence}
            you
            unread={Boolean(selfDm && (selfDm.unreadCount > 0 || selfDm.mentionCount > 0))}
            onPress={() => {
              if (selfDm) nav.navigate("Channel", { channelId: selfDm.id });
              else nav.navigate("EditProfile");
            }}
          />
          {otherDms.map((c) => {
            const peer = dmPeer(members, c, me.id) ?? members.find((member) => member.userId !== me.id);
            return (
              <DmRow
                key={c.id}
                name={c.dmName ?? c.name}
                image={peer?.image}
                presence={peer?.presence}
                unread={c.unreadCount > 0 || c.mentionCount > 0}
                badge={c.isMpim ? c.memberCount : undefined}
                onPress={() => nav.navigate("Channel", { channelId: c.id })}
              />
            );
          })}
        </Section>
      </ScrollView>

      <FloatingWorkspaceChrome
        compact={compact}
        glyph={<WorkspaceGlyph workspace={workspace} size={compact ? 36 : 32} round={compact} />}
        meName={me.displayName}
        meImage={me.image}
        mePresence={me.presence}
        onWorkspacePress={() => setSwitcher(true)}
        onMe={() => nav.navigate("You")}
      />

      <Modal visible={switcher} transparent animationType="fade" onRequestClose={() => setSwitcher(false)}>
        <Pressable style={styles.scrim} onPress={() => setSwitcher(false)} />
        <View style={[styles.switcher, { top: insets.top + 52 }]}>
          {workspaces.map((ws) => (
            <Pressable
              key={ws.id}
              style={styles.switchRow}
              onPress={() => {
                setSwitcher(false);
                void selectWorkspace(ws.id);
              }}
            >
              <WorkspaceGlyph workspace={ws} size={36} />
              <View style={{ flex: 1 }}>
                <Text style={styles.switchName}>{ws.name}</Text>
                <Text style={styles.switchSlug}>{ws.slug}</Text>
              </View>
              {ws.id === workspace.id ? <Text style={styles.check}>✓</Text> : null}
            </Pressable>
          ))}
          {otherAccounts.map((account) => (
            <Pressable
              key={account.id}
              style={styles.switchRow}
              onPress={() => {
                setSwitcher(false);
                void switchAccount(account.id);
              }}
            >
              <View style={[styles.fallbackGlyph, { backgroundColor: account.workspace?.iconColor || colors.aubergine }]}>
                <Text style={styles.fallbackGlyphTxt}>
                  {(account.workspace?.iconLetter || account.name[0] || "W").toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.switchName}>{account.workspace?.name || account.name}</Text>
                <Text style={styles.switchSlug}>{account.workspace?.slug || account.email}</Text>
              </View>
            </Pressable>
          ))}
          <Pressable
            style={styles.switchRow}
            onPress={() => {
              setSwitcher(false);
              nav.navigate("AddWorkspace");
            }}
          >
            <View style={styles.addIco}>
              <Text style={styles.addPlus}>+</Text>
            </View>
            <Text style={styles.switchName}>Add a workspace</Text>
          </Pressable>
        </View>
      </Modal>
    </ScreenCanvas>
  );
}

function Shortcut({
  icon,
  label,
  sub,
  onPress,
}: {
  icon: ReactNode;
  label: string;
  sub: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.tile} onPress={onPress}>
      {icon}
      <Text style={styles.tileLabel}>{label}</Text>
      <Text style={styles.tileSub}>{sub}</Text>
    </Pressable>
  );
}

function Section({
  icon,
  title,
  open,
  onToggle,
  children,
}: {
  icon: ReactNode;
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Pressable style={styles.secHead} onPress={onToggle}>
        {icon}
        <Text style={styles.sec}>{title}</Text>
        <Text style={styles.secTrail}>›</Text>
        <View style={{ flex: 1 }} />
        <Text style={styles.secChev}>{open ? "⌃" : "⌄"}</Text>
      </Pressable>
      {open ? children : null}
    </View>
  );
}

function ChannelRow({ channel, onPress }: { channel: Channel; onPress: () => void }) {
  const unread = channel.unreadCount > 0 || channel.mentionCount > 0;
  return (
    <Pressable
      onPress={onPress}
      onLongPress={() => {
        void api(`/api/channels/${channel.id}/star`, { method: "POST" }).then(() =>
          queryClient.invalidateQueries({ queryKey: ["bootstrap"] }),
        );
      }}
      style={styles.row}
    >
      {channel.isPrivate ? (
        <IconLock color={unread ? colors.ink : colors.muted} />
      ) : (
        <IconHash color={unread ? colors.ink : colors.muted} size={18} />
      )}
      <Text style={[styles.chName, unread && styles.chUnread]} numberOfLines={1}>
        {channel.name}
      </Text>
      {channel.huddle?.active ? <View style={styles.huddleDot} /> : null}
      {channel.mentionCount ? (
        <View style={styles.pill}>
          <Text style={styles.pillTxt}>{channel.mentionCount}</Text>
        </View>
      ) : channel.unreadCount ? (
        <View style={styles.dot} />
      ) : null}
    </Pressable>
  );
}

function DmRow({
  name,
  image,
  presence,
  you,
  unread,
  badge,
  onPress,
}: {
  name: string;
  image?: string | null;
  presence?: string | null;
  you?: boolean;
  unread?: boolean;
  badge?: number;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <View>
        <Avatar name={name} image={image} presence={presence} size={32} />
        {badge ? (
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeTxt}>{badge}</Text>
          </View>
        ) : null}
      </View>
      <Text style={[styles.chName, unread && styles.chUnread]} numberOfLines={1}>
        {name}
        {you ? " (you)" : ""}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tiles: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10, gap: 10 },
  tile: {
    width: 108,
    minHeight: 92,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.tileBorder,
    backgroundColor: colors.tile,
    padding: 12,
    gap: 2,
  },
  tileLabel: { color: colors.ink, fontWeight: "700", fontSize: 15, marginTop: 8 },
  tileSub: { color: colors.muted, fontSize: 13 },
  section: { paddingTop: 6 },
  secHead: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  sec: { color: colors.muted, fontSize: 15, fontWeight: "600" },
  secTrail: { color: colors.faint, fontSize: 16, marginTop: 1 },
  secChev: { color: colors.faint, fontSize: 16 },
  row: {
    minHeight: 44,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  chName: { flex: 1, color: colors.ink, fontSize: 17, fontWeight: "400" },
  chUnread: { fontWeight: "800" },
  huddleDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.green },
  pill: {
    backgroundColor: colors.unread,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  pillTxt: { color: "#fff", fontSize: 12, fontWeight: "800" },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.unread },
  addIco: {
    width: 18,
    height: 18,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  addPlus: { color: colors.muted, fontSize: 18, fontWeight: "600", marginTop: -2 },
  addTxt: { color: colors.muted, fontSize: 16 },
  countBadge: {
    position: "absolute",
    right: -4,
    bottom: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.inputFill,
    borderWidth: 1,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  countBadgeTxt: { color: colors.ink, fontSize: 10, fontWeight: "800" },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.32)" },
  switcher: {
    position: "absolute",
    left: 12,
    right: 12,
    backgroundColor: "#1A1D21",
    borderRadius: 12,
    paddingVertical: 6,
    overflow: "hidden",
  },
  switchRow: {
    minHeight: 56,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  switchName: { color: "#fff", fontWeight: "700", fontSize: 16 },
  switchSlug: { color: "#ababad", fontSize: 13, marginTop: 1 },
  check: { color: "#fff", fontWeight: "800" },
  fallbackGlyph: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  fallbackGlyphTxt: { color: "#fff", fontWeight: "800", fontSize: 16 },
});

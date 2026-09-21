import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ActivityItem,
  Channel,
  ChatMessage,
  FileItem,
  Huddle,
  Invite,
  Member,
  SearchHit,
  Workspace,
  WsServerEvent,
} from "@relay/shared";
import { Room, RoomEvent } from "livekit-client";
import { relayChannels } from "../../shared/ipc";
import { api, signOut } from "./lib/auth";
import { connectWs } from "./lib/ws";
import { useAccounts } from "./lib/accounts";
import { Avatar } from "./components/Avatar";
import {
  applyWsEvent,
  clearChannelUnread,
  getViewedChannelId,
  keys,
  setActiveWorkspaceId,
  setViewedChannelId,
  type Bootstrap,
  type Me,
  type MeResponse,
} from "./lib/query";
import { Composer } from "./components/Composer";
import { MessageList } from "./components/MessageList";
import { CreateWorkspaceScreen } from "./components/CreateWorkspaceScreen";
import { AcceptInviteScreen } from "./components/AcceptInviteScreen";
import {
  AddWorkspaceDialog,
  ChannelDialog,
  ChannelInfoDialog,
  InviteDialog,
  MembersDialog,
  NewMessagePane,
  WorkspaceSettingsDialog,
} from "./components/Dialogs";
import { ProfilePane } from "./components/ProfilePane";
import { WorkspaceGlyph } from "./components/WorkspaceGlyph";
import {
  Back,
  BellIcon,
  Chevron,
  Close,
  DmIcon,
  FileIcon,
  Forward,
  Headphones,
  Help,
  HomeIcon,
  Info,
  LaterIcon,
  Leave,
  Mic,
  MicOff,
  MoreIcon,
  Pencil,
  Plus,
  Screen,
  SearchIcon,
  Settings,
  Users,
  Video,
} from "./components/Icons";

type HomeView = "channels" | "threads" | "huddles" | "starred" | "mentions" | "drafts";
type Dialog =
  | "invite"
  | "channel"
  | "dm"
  | "members"
  | "info"
  | "self"
  | "workspace"
  | "workspace-settings"
  | "switcher"
  | null;

function openHelpAndUpdates() {
  window.dispatchEvent(new Event(relayChannels.openUpdates));
}

export function WorkspaceApp() {
  const qc = useQueryClient();
  const { accounts, activeAccountId } = useAccounts();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [thread, setThread] = useState<ChatMessage | null>(null);
  const [rail, setRail] = useState<"home" | "dms" | "activity" | "files" | "later">("home");
  const [homeView, setHomeView] = useState<HomeView>("channels");
  const [switcher, setSwitcher] = useState(false);
  const [addWorkspace, setAddWorkspace] = useState(false);
  const [skipInvites, setSkipInvites] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [typing, setTyping] = useState<string | null>(null);
  const [inHuddle, setInHuddle] = useState(false);
  const [muted, setMuted] = useState(false);
  const [camera, setCamera] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [profile, setProfile] = useState<Member | null>(null);
  const [nav, setNav] = useState<{ stack: string[]; idx: number }>({ stack: [], idx: -1 });
  const scrollRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<ReturnType<typeof connectWs> | null>(null);
  const roomRef = useRef<Room | null>(null);
  const meIdRef = useRef<string | null>(null);
  const activeIdRef = useRef<string | null>(null);
  const switcherRowsRef = useRef<Array<{ accountId: string; workspaceId: string | null }>>([]);
  const openSwitcherItemRef = useRef<(item: { accountId: string; workspaceId: string | null }) => Promise<void>>(
    async () => undefined,
  );

  const meQuery = useQuery({
    queryKey: keys.me,
    queryFn: () => api<MeResponse>("/api/me"),
  });
  const me = meQuery.data?.user ?? null;
  const workspace = meQuery.data?.workspace ?? null;
  const workspaces = meQuery.data?.workspaces ?? [];
  meIdRef.current = me?.id ?? null;
  activeIdRef.current = activeId;
  setViewedChannelId(activeId);

  useEffect(() => {
    setActiveWorkspaceId(meQuery.data?.activeWorkspaceId ?? workspace?.id ?? null);
  }, [meQuery.data?.activeWorkspaceId, workspace?.id]);

  const bootQuery = useQuery({
    queryKey: keys.bootstrap(workspace?.id ?? ""),
    queryFn: () => api<Bootstrap>(`/api/workspaces/${workspace!.id}/bootstrap`),
    enabled: Boolean(workspace?.id),
  });
  const members = bootQuery.data?.members ?? [];
  const channels = bootQuery.data?.channels ?? [];
  const memberMap = useMemo(() => new Map(members.map((m) => [m.userId, m])), [members]);
  const active = channels.find((c) => c.id === activeId) ?? null;

  const messagesQuery = useQuery({
    queryKey: keys.messages(activeId ?? "", null),
    queryFn: () =>
      api<{ messages: ChatMessage[]; huddle: Huddle | null }>(`/api/channels/${activeId}/messages`),
    enabled: Boolean(activeId),
  });
  const messages = messagesQuery.data?.messages ?? [];

  const threadQuery = useQuery({
    queryKey: keys.messages(thread?.channelId ?? "", thread?.id ?? null),
    queryFn: () =>
      api<{ messages: ChatMessage[] }>(
        `/api/channels/${thread!.channelId}/messages?parentId=${thread!.id}`,
      ),
    enabled: Boolean(thread),
  });
  const threadMsgs = threadQuery.data?.messages ?? [];

  const activityQuery = useQuery({
    queryKey: keys.activity(workspace?.id ?? ""),
    queryFn: () => api<{ items: ActivityItem[] }>("/api/activity"),
    enabled: Boolean(workspace) && (rail === "activity" || homeView === "mentions"),
  });
  const filesQuery = useQuery({
    queryKey: keys.files(workspace?.id ?? ""),
    queryFn: () => api<{ items: FileItem[] }>("/api/files"),
    enabled: Boolean(workspace) && rail === "files",
  });
  const laterQuery = useQuery({
    queryKey: keys.later(workspace?.id ?? ""),
    queryFn: () => api<{ items: ChatMessage[] }>("/api/later"),
    enabled: Boolean(workspace) && rail === "later",
  });
  const threadsQuery = useQuery({
    queryKey: keys.threads(workspace?.id ?? ""),
    queryFn: () => api<{ items: ChatMessage[] }>("/api/threads"),
    enabled: Boolean(workspace) && homeView === "threads",
  });
  const invitesQuery = useQuery({
    queryKey: keys.invites(workspace?.id ?? ""),
    queryFn: () => api<{ invites: Invite[] }>("/api/invites"),
    enabled: Boolean(workspace) && dialog === "invite",
  });

  function goTo(id: string) {
    setDialog((d) => (d === "dm" ? null : d));
    setActiveId(id);
    setHomeView("channels");
    setNav((n) => {
      if (n.stack[n.idx] === id) return n;
      const stack = [...n.stack.slice(0, n.idx + 1), id];
      return { stack, idx: stack.length - 1 };
    });
  }

  function startNewMessage() {
    setThread(null);
    setProfile(null);
    setSwitcher(false);
    if (dialog === "dm") {
      document.getElementById("new-msg-to")?.focus();
      return;
    }
    setDialog("dm");
  }

  function historyBack() {
    setNav((n) => {
      if (n.idx <= 0) return n;
      const idx = n.idx - 1;
      setActiveId(n.stack[idx] ?? null);
      return { ...n, idx };
    });
  }

  function historyForward() {
    setNav((n) => {
      if (n.idx >= n.stack.length - 1) return n;
      const idx = n.idx + 1;
      setActiveId(n.stack[idx] ?? null);
      return { ...n, idx };
    });
  }

  useEffect(() => {
    const accept = () => {
      const token =
        sessionStorage.getItem("relay-invite") ??
        new URLSearchParams(window.location.search).get("invite");
      if (!token || !me || !workspace) return;
      void api<{ workspace: Workspace }>("/api/invites/accept", { method: "POST", body: JSON.stringify({ token }) })
        .then(async (res) => {
          if (res.workspace?.id) {
            await api(`/api/workspaces/${res.workspace.id}/select`, { method: "POST" });
            setActiveWorkspaceId(res.workspace.id);
          }
        })
        .catch(() => null)
        .finally(() => {
          sessionStorage.removeItem("relay-invite");
          if (window.location.search.includes("invite=")) window.history.replaceState({}, "", "/");
          void qc.invalidateQueries({ queryKey: keys.me });
          void qc.invalidateQueries({ queryKey: ["bootstrap"] });
        });
    };
    accept();
    window.addEventListener("relay-invite", accept);
    return () => window.removeEventListener("relay-invite", accept);
  }, [me, workspace, qc]);

  useEffect(() => {
    if (activeId || !channels.length) return;
    const first =
      channels.find((c) => c.name === "general") ??
      channels.find((c) => !c.isDm) ??
      channels[0];
    if (first) goTo(first.id);
  }, [channels, activeId]);

  useEffect(() => {
    if (workspace) document.title = `${workspace.name} | Relay`;
  }, [workspace]);

  useEffect(() => {
    const mine = channels.reduce((sum, channel) => sum + channel.unreadCount + channel.mentionCount, 0);
    void window.relayDesktop.setBadge(mine);
  }, [channels]);

  useEffect(() => {
    void window.relayDesktop.setActiveChannel(activeId);
  }, [activeId]);

  useEffect(() => {
    const applyNav = () => {
      const raw = sessionStorage.getItem("relay-nav");
      if (!raw) return;
      try {
        const nav = JSON.parse(raw) as { accountId?: string; workspaceId?: string; channelId?: string };
        if (nav.accountId && me?.id && nav.accountId !== me.id) return;
        sessionStorage.removeItem("relay-nav");
        if (nav.workspaceId && nav.workspaceId !== workspace?.id) {
          void switchWorkspace(nav.workspaceId).then(() => {
            if (nav.channelId) goTo(nav.channelId);
          });
          return;
        }
        if (nav.channelId) goTo(nav.channelId);
      } catch {
        sessionStorage.removeItem("relay-nav");
      }
    };
    applyNav();
    window.addEventListener("relay-nav", applyNav);
    return () => window.removeEventListener("relay-nav", applyNav);
  }, [me?.id, workspace?.id]);

  useEffect(() => {
    const huddle = messagesQuery.data?.huddle;
    if (!activeId || huddle === undefined) return;
    qc.setQueriesData<Bootstrap>({ queryKey: ["bootstrap"] }, (boot) => {
      if (!boot) return boot;
      return {
        ...boot,
        channels: boot.channels.map((c) => (c.id === activeId ? { ...c, huddle } : c)),
      };
    });
  }, [messagesQuery.data?.huddle, activeId, qc]);

  useEffect(() => {
    if (!me) return;
    const sock = connectWs(
      (ev: WsServerEvent, accountId: string) => {
        if (accountId !== (meIdRef.current ?? me.id)) return;
        applyWsEvent(ev, meIdRef.current ?? me.id);
        if (ev.type === "typing" && ev.userId !== me.id) {
          setTyping(`${ev.userName} is typing…`);
          window.setTimeout(() => setTyping(null), 2500);
        }
      },
      (accountId) => {
        if (accountId && accountId !== (meIdRef.current ?? me.id)) return;
        if (workspace?.id) sock.send({ type: "workspace.select", workspaceId: workspace.id });
        const channelId = activeIdRef.current;
        if (channelId) sock.send({ type: "subscribe", channelId });
      },
    );
    wsRef.current = sock;
    return () => sock.close();
  }, [me?.id, workspace?.id]);

  useEffect(() => {
    if (!activeId) return;
    clearChannelUnread(activeId);
    wsRef.current?.send({ type: "subscribe", channelId: activeId });
    setThread(null);
    return () => {
      wsRef.current?.send({ type: "unsubscribe", channelId: activeId });
    };
  }, [activeId]);

  useEffect(() => {
    const openId = getViewedChannelId();
    if (openId) clearChannelUnread(openId);
  }, [bootQuery.dataUpdatedAt]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length, activeId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSwitcher(true);
      }
      if (e.key === "Escape") {
        setSwitcher(false);
        setThread(null);
        setProfile(null);
        setDialog(null);
        setAddWorkspace(false);
      }
      if ((e.metaKey || e.ctrlKey) && /^[1-9]$/.test(e.key)) {
        const item = switcherRowsRef.current[Number(e.key) - 1];
        if (item) {
          e.preventDefault();
          void openSwitcherItemRef.current(item);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function openThread(msg: ChatMessage) {
    setProfile(null);
    setThread(msg);
    await qc.invalidateQueries({ queryKey: keys.messages(msg.channelId, msg.id) });
  }

  async function sendPayload(channelId: string, body: string, file?: File, parentId?: string | null) {
    if (!me) return;
    const clientId = crypto.randomUUID();
    const key = keys.messages(channelId, parentId ?? null);
    const optimistic: ChatMessage = {
      id: clientId,
      channelId,
      parentId: parentId ?? null,
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
      fileName: file?.name ?? null,
      fileContentType: file?.type ?? null,
      pending: true,
      clientId,
    };
    await qc.cancelQueries({ queryKey: key });
    qc.setQueryData<{ messages: ChatMessage[] }>(key, (old) => ({
      ...old,
      messages: [...(old?.messages ?? []), optimistic],
    }));
    const fail = () => {
      qc.setQueryData<{ messages: ChatMessage[] }>(key, (old) => ({
        ...old,
        messages: (old?.messages ?? []).map((m) =>
          m.clientId === clientId && m.pending ? { ...m, pending: false, failed: true } : m,
        ),
      }));
    };
    const timer = window.setTimeout(fail, 12_000);
    try {
      let fileKey: string | undefined;
      let fileName: string | undefined;
      let fileContentType: string | undefined;
      if (file) {
        const form = new FormData();
        form.append("file", file);
        const uploaded = await api<{ key: string; name: string; contentType: string }>("/api/files", {
          method: "POST",
          body: form,
        });
        fileKey = uploaded.key;
        fileName = uploaded.name;
        fileContentType = uploaded.contentType;
      }
      const created = await api<{ message: ChatMessage }>(`/api/channels/${channelId}/messages`, {
        method: "POST",
        body: JSON.stringify({
          body,
          parentId,
          clientId,
          fileKey,
          fileName,
          fileContentType,
        }),
      });
      window.clearTimeout(timer);
      applyWsEvent({ type: "message.created", message: { ...created.message, clientId } }, me.id);
    } catch {
      window.clearTimeout(timer);
      fail();
    }
  }

  async function joinHuddle() {
    if (!activeId) return;
    await window.relayDesktop.prepareMedia();
    const res = await api<{ huddle: Huddle; livekit: { url: string | null; token: string | null } }>(
      `/api/channels/${activeId}/huddle/join`,
      { method: "POST" },
    );
    setInHuddle(true);
    applyWsEvent({ type: "huddle.updated", channelId: activeId, huddle: res.huddle }, me?.id ?? "");
    if (res.livekit.url && res.livekit.token) {
      const room = new Room();
      room.on(RoomEvent.Disconnected, () => setInHuddle(false));
      await room.connect(res.livekit.url, res.livekit.token);
      await room.startAudio().catch(() => undefined);
      await room.localParticipant.setMicrophoneEnabled(!muted);
      roomRef.current = room;
    }
    wsRef.current?.send({ type: "huddle.join", channelId: activeId });
  }

  async function leaveHuddle() {
    if (!activeId) return;
    await api(`/api/channels/${activeId}/huddle/leave`, { method: "POST" });
    wsRef.current?.send({ type: "huddle.leave", channelId: activeId });
    await roomRef.current?.disconnect();
    roomRef.current = null;
    setInHuddle(false);
    setSharing(false);
    setShareError(null);
  }

  async function shareScreen() {
    const room = roomRef.current;
    if (!room) {
      setShareError("Join the huddle before sharing your screen.");
      return;
    }
    const next = !sharing;
    setShareError(null);
    try {
      await room.localParticipant.setScreenShareEnabled(next);
      setSharing(next);
    } catch (error) {
      setSharing(false);
      const denied = error instanceof Error ? error.message : "";
      setShareError(
        denied.toLowerCase().includes("permission") || denied.toLowerCase().includes("notallowed")
          ? "Screen sharing was blocked. Allow screen recording for Relay in System Settings, then try again."
          : "Couldn’t share the screen. Allow screen recording for Relay in System Settings, then try again.",
      );
    }
  }

  async function toggleMic() {
    const next = !muted;
    setMuted(next);
    await roomRef.current?.localParticipant.setMicrophoneEnabled(!next);
  }

  async function toggleCam() {
    const next = !camera;
    setCamera(next);
    await roomRef.current?.localParticipant.setCameraEnabled(next);
  }

  async function openDm(userId: string, body?: string, file?: File) {
    if (!workspace) return;
    const res = await api<{ channel: Channel }>("/api/dms", {
      method: "POST",
      body: JSON.stringify({ userId, workspaceId: workspace.id }),
    });
    applyWsEvent({ type: "channel.created", channel: res.channel }, me?.id ?? "");
    goTo(res.channel.id);
    setDialog(null);
    setProfile(null);
    setRail("dms");
    if (body || file) await sendPayload(res.channel.id, body ?? "", file);
  }

  async function createChannel(name: string, isPrivate: boolean) {
    if (!workspace) return;
    const res = await api<{ channel: Channel }>("/api/channels", {
      method: "POST",
      body: JSON.stringify({ name, isPrivate, workspaceId: workspace.id }),
    });
    applyWsEvent({ type: "channel.created", channel: res.channel }, me?.id ?? "");
    goTo(res.channel.id);
    setDialog(null);
    setRail("home");
  }

  async function starActive() {
    if (!active) return;
    const res = await api<{ isStarred: boolean }>(`/api/channels/${active.id}/star`, { method: "POST" });
    qc.setQueriesData<Bootstrap>({ queryKey: ["bootstrap"] }, (boot) => {
      if (!boot) return boot;
      return {
        ...boot,
        channels: boot.channels.map((c) =>
          c.id === active.id
            ? { ...c, isStarred: res.isStarred, section: res.isStarred ? "starred" : c.isDm ? "direct" : "channels" }
            : c,
        ),
      };
    });
  }

  async function saveLater(m: ChatMessage) {
    await api(`/api/messages/${m.id}/later`, { method: "POST" });
    void qc.invalidateQueries({ queryKey: keys.later(workspace?.id ?? "") });
  }

  async function editMessage(m: ChatMessage, body: string) {
    await api(`/api/messages/${m.id}`, { method: "PATCH", body: JSON.stringify({ body }) });
  }

  async function deleteMessage(m: ChatMessage) {
    await api(`/api/messages/${m.id}`, { method: "DELETE" });
    if (thread?.id === m.id) setThread(null);
  }

  async function updateProfile(patch: {
    displayName?: string;
    title?: string | null;
    statusText?: string | null;
    statusEmoji?: string | null;
  }) {
    await api("/api/me", { method: "PATCH", body: JSON.stringify(patch) });
    await qc.invalidateQueries({ queryKey: keys.me });
    await qc.invalidateQueries({ queryKey: ["bootstrap"] });
  }

  async function uploadMyPhoto(file: File) {
    const form = new FormData();
    form.append("file", file);
    await api<{ image: string | null }>("/api/me/photo", { method: "POST", body: form });
    await qc.invalidateQueries({ queryKey: keys.me });
    await qc.invalidateQueries({ queryKey: ["bootstrap"] });
  }

  async function saveWorkspace(patch: { name: string; iconColor: string; iconLetter: string }) {
    if (!workspace) return;
    await api(`/api/workspaces/${workspace.id}`, { method: "PATCH", body: JSON.stringify(patch) });
    await qc.invalidateQueries({ queryKey: keys.me });
    await qc.invalidateQueries({ queryKey: ["bootstrap"] });
    setDialog(null);
  }

  async function uploadWorkspaceIcon(file: File) {
    if (!workspace) return;
    const form = new FormData();
    form.append("file", file);
    await api(`/api/workspaces/${workspace.id}/icon`, { method: "POST", body: form });
    await qc.invalidateQueries({ queryKey: keys.me });
    await qc.invalidateQueries({ queryKey: ["bootstrap"] });
    setDialog(null);
  }

  function openProfile(userId: string) {
    if (!me) return;
    setThread(null);
    if (userId === me.id) setProfile(toMember(me));
    else setProfile(memberMap.get(userId) ?? null);
  }

  async function switchWorkspace(workspaceId: string) {
    if (workspaceId === workspace?.id) return;
    await api(`/api/workspaces/${workspaceId}/select`, { method: "POST" });
    setActiveWorkspaceId(workspaceId);
    setActiveId(null);
    setThread(null);
    setRail("home");
    setHomeView("channels");
    qc.removeQueries({ queryKey: ["bootstrap"] });
    await qc.invalidateQueries({ queryKey: keys.me });
  }

  const switcherRows = useMemo(() => {
    const meId = activeAccountId ?? me?.id ?? "";
    const rows: Array<{
      key: string;
      accountId: string;
      workspaceId: string | null;
      name: string;
      subtitle: string;
      glyph: Pick<Workspace, "name" | "iconColor" | "iconLetter" | "iconUrl">;
      active: boolean;
    }> = [];
    for (const ws of workspaces) {
      rows.push({
        key: `${meId}:${ws.id}`,
        accountId: meId,
        workspaceId: ws.id,
        name: ws.name,
        subtitle: ws.slug,
        glyph: ws,
        active: ws.id === workspace?.id,
      });
    }
    for (const account of accounts) {
      if (account.id === meId) continue;
      const preview = account.workspace;
      rows.push({
        key: account.id,
        accountId: account.id,
        workspaceId: preview?.id ?? account.activeWorkspaceId,
        name: preview?.name || account.name,
        subtitle: preview?.slug || account.email,
        glyph: preview ?? {
          name: account.name,
          iconColor: "#1A5FB4",
          iconLetter: (account.name[0] || "W").toUpperCase(),
          iconUrl: null,
        },
        active: false,
      });
    }
    return rows;
  }, [accounts, activeAccountId, me?.id, workspace?.id, workspaces]);

  async function openSwitcherItem(item: { accountId: string; workspaceId: string | null }) {
    setDialog(null);
    if (item.accountId && item.accountId !== (activeAccountId ?? me?.id)) {
      await window.relayDesktop.switchAccount(item.accountId);
      return;
    }
    if (item.workspaceId) await switchWorkspace(item.workspaceId);
  }
  switcherRowsRef.current = switcherRows;
  openSwitcherItemRef.current = openSwitcherItem;

  const starred = channels.filter((c) => c.isStarred && !c.isDm);
  const chans = channels.filter((c) => !c.isDm && !c.isStarred);
  const dms = channels.filter((c) => c.isDm);
  const huddle = active?.huddle ?? null;
  const mentionTotal = channels.reduce((n, c) => n + c.mentionCount, 0);
  const liveHuddles = channels.filter((c) => c.huddle?.active);
  const drafts = listDrafts(channels);
  const shownProfile =
    profile && me
      ? profile.userId === me.id
        ? toMember(me)
        : (memberMap.get(profile.userId) ?? profile)
      : null;

  if (meQuery.isError) {
    return (
      <div className="shell" style={{ background: "var(--aubergine)", color: "#fff", padding: 32 }}>
        <p>Couldn’t load Relay.</p>
        <button type="button" onClick={() => void meQuery.refetch()}>
          Try again
        </button>
      </div>
    );
  }
  if (meQuery.isPending || !me) {
    return <div className="shell" style={{ background: "var(--aubergine)" }} />;
  }
  if (!workspace) {
    const pendingInvites = meQuery.data?.pendingInvites ?? [];
    const onCreated = () => {
      void qc.invalidateQueries({ queryKey: keys.me });
    };
    if (pendingInvites.length > 0 && !skipInvites) {
      return (
        <AcceptInviteScreen
          pendingInvites={pendingInvites}
          onCreated={onCreated}
          onCreateWorkspace={() => setSkipInvites(true)}
        />
      );
    }
    return (
      <CreateWorkspaceScreen
        defaultName={me.name ? `${me.name.split(" ")[0]}’s workspace` : ""}
        onCreated={onCreated}
        onBackToInvites={pendingInvites.length ? () => setSkipInvites(false) : undefined}
      />
    );
  }

  const threadParent = thread
    ? (messages.find((m) => m.id === thread.id) ?? thread)
    : null;

  return (
    <div className={`shell ${thread || shownProfile ? "with-thread" : ""} electron`}>
      <header className="topbar">
        <div className="history-btns">
          <button className="icon-btn" aria-label="Back" disabled={nav.idx <= 0} onClick={historyBack}>
            <Back />
          </button>
          <button
            className="icon-btn"
            aria-label="Forward"
            disabled={nav.idx >= nav.stack.length - 1}
            onClick={historyForward}
          >
            <Forward />
          </button>
        </div>
        <div className="search-wrap">
          <SearchIcon size={14} aria-hidden />
          <input
            className="search"
            readOnly
            placeholder={`Search ${workspace.name}`}
            onClick={() => setSwitcher(true)}
          />
        </div>
        <div className="top-help">
          <button className="icon-btn" aria-label="Help and updates" onClick={openHelpAndUpdates}>
            <Help />
          </button>
        </div>
      </header>

      <nav className="rail">
        <WorkspaceGlyph workspace={workspace} title={workspace.name} onClick={() => setDialog("switcher")} />
        <div className="rail-nav">
          <RailBtn
            icon={<HomeIcon />}
            label="Home"
            active={rail === "home"}
            onClick={() => {
              setRail("home");
              setHomeView("channels");
            }}
          />
          <RailBtn
            icon={<DmIcon />}
            label="DMs"
            active={rail === "dms"}
            onClick={() => setRail("dms")}
            badge={dms.reduce((n, c) => n + c.unreadCount, 0) || undefined}
          />
          <RailBtn
            icon={<BellIcon />}
            label="Activity"
            active={rail === "activity"}
            onClick={() => setRail("activity")}
            badge={mentionTotal || undefined}
          />
          <RailBtn icon={<FileIcon />} label="Files" active={rail === "files"} onClick={() => setRail("files")} />
          <RailBtn icon={<LaterIcon />} label="Later" active={rail === "later"} onClick={() => setRail("later")} />
          <RailBtn icon={<MoreIcon />} label="More" active={false} onClick={() => setDialog("workspace")} />
        </div>
        <div className="rail-spacer" />
        <Avatar
          as="button"
          className="rail-avatar"
          name={me.name}
          image={me.image}
          title={me.name}
          onClick={() => openProfile(me.id)}
        >
          <i className="presence" />
        </Avatar>
      </nav>

      <aside className="sidebar">
        <div className="sb-head">
          <h2 onClick={() => setDialog("switcher")}>
            {workspace.name}
            <Chevron size={16} strokeWidth={2.2} />
          </h2>
          <div className="sb-head-actions">
            <button className="sb-icon-btn" title="Workspace settings" onClick={() => setDialog("workspace")}>
              <Settings size={18} />
            </button>
            <button className="compose-fab" title="New message" onClick={startNewMessage}>
              <Pencil size={16} />
            </button>
          </div>
        </div>
        <div className="sb-scroll">
          {rail === "home" && homeView === "channels" && (
            <>
              <button className="sb-item" onClick={() => setHomeView("threads")}>
                <span className="ch-hash">☰</span>
                <span className="label">Threads</span>
              </button>
              <button className="sb-item" onClick={() => setHomeView("huddles")}>
                <span className="ch-hash">♪</span>
                <span className="label">Huddles</span>
                {liveHuddles.length ? <span className="pill">{liveHuddles.length}</span> : null}
              </button>
              <button className="sb-item" onClick={() => setHomeView("starred")}>
                <span className="ch-hash">★</span>
                <span className="label">Starred</span>
              </button>
              <button
                className={`sb-item ${mentionTotal ? "unread" : ""}`}
                onClick={() => setHomeView("mentions")}
              >
                <span className="ch-hash">◎</span>
                <span className="label">Mentions & reactions</span>
                {mentionTotal ? <span className="pill">{mentionTotal}</span> : null}
              </button>
              <button className="sb-item" onClick={() => setHomeView("drafts")}>
                <span className="ch-hash">»</span>
                <span className="label">Drafts & sent</span>
                {drafts.length ? <span className="pill">{drafts.length}</span> : null}
              </button>

              {starred.length > 0 && (
                <Section title="Starred">
                  {starred.map((c) => (
                    <ChannelRow
                      key={c.id}
                      c={c}
                      active={c.id === activeId && dialog !== "dm"}
                      members={memberMap}
                      meId={me.id}
                      onClick={() => goTo(c.id)}
                    />
                  ))}
                </Section>
              )}
              <Section title="Channels">
                {chans.map((c) => (
                  <ChannelRow
                    key={c.id}
                    c={c}
                    active={c.id === activeId && dialog !== "dm"}
                    members={memberMap}
                    meId={me.id}
                    onClick={() => goTo(c.id)}
                  />
                ))}
                <button className="ch-item" onClick={() => setDialog("channel")}>
                  <span className="ch-hash">+</span>
                  <span className="label">Add channels</span>
                </button>
              </Section>
              <Section title="Direct messages">
                {dms.map((c) => (
                  <ChannelRow
                    key={c.id}
                    c={c}
                    active={c.id === activeId && dialog !== "dm"}
                    members={memberMap}
                    meId={me.id}
                    onClick={() => goTo(c.id)}
                  />
                ))}
                <button className="ch-item" onClick={() => setDialog("invite")}>
                  <span className="ch-hash">+</span>
                  <span className="label">Add teammates</span>
                </button>
              </Section>
            </>
          )}
          {rail === "home" && homeView === "threads" && (
            <SideList
              empty="No threads yet."
              items={(threadsQuery.data?.items ?? []).map((m) => ({
                id: m.id,
                title: m.userName,
                meta: `${m.replyCount} ${m.replyCount === 1 ? "reply" : "replies"}`,
                onClick: () => {
                  goTo(m.channelId);
                  void openThread(m);
                },
              }))}
            />
          )}
          {rail === "home" && homeView === "huddles" && (
            <SideList
              empty="No huddles right now."
              items={liveHuddles.map((c) => ({
                id: c.id,
                title: c.isDm ? c.name : `#${c.name}`,
                meta: `${c.huddle?.participants.length ?? 0} in huddle`,
                onClick: () => goTo(c.id),
              }))}
            />
          )}
          {rail === "home" && homeView === "starred" && (
            <div className="sb-pad">
              {starred.length === 0 ? <div className="sb-empty">Star a channel to see it here.</div> : null}
              {starred.map((c) => (
                <ChannelRow
                  key={c.id}
                  c={c}
                  active={c.id === activeId && dialog !== "dm"}
                  members={memberMap}
                  meId={me.id}
                  onClick={() => goTo(c.id)}
                />
              ))}
            </div>
          )}
          {rail === "home" && homeView === "mentions" && (
            <SideList
              empty="No mentions yet."
              items={(activityQuery.data?.items ?? [])
                .filter((i) => i.kind === "mention" || i.kind === "reaction")
                .map((i) => activityRow(i, () => goTo(i.channelId)))}
            />
          )}
          {rail === "home" && homeView === "drafts" && (
            <SideList
              empty="No drafts."
              items={drafts.map((d) => ({
                id: d.channelId,
                title: d.name,
                meta: d.body,
                onClick: () => goTo(d.channelId),
              }))}
            />
          )}
          {rail === "dms" && (
            <>
              <button className="ch-item" onClick={startNewMessage}>
                <span className="ch-hash">+</span>
                <span className="label">New message</span>
              </button>
              {dms.map((c) => (
                <ChannelRow
                  key={c.id}
                  c={c}
                  active={c.id === activeId && dialog !== "dm"}
                  members={memberMap}
                  meId={me.id}
                  onClick={() => goTo(c.id)}
                />
              ))}
            </>
          )}
          {rail === "activity" && (
            <SideList
              empty="Mentions, reactions, and thread replies will land here."
              items={(activityQuery.data?.items ?? []).map((i) =>
                activityRow(i, () => {
                  goTo(i.channelId);
                  if (!i.message.parentId && i.kind === "thread") void openThread(i.message);
                }),
              )}
            />
          )}
          {rail === "files" && (
            <SideList
              empty="Shared files will show up here."
              items={(filesQuery.data?.items ?? []).map((f) => ({
                id: f.messageId,
                title: f.fileName,
                meta: `${f.userName} · ${f.channelName}`,
                onClick: () => goTo(f.channelId),
              }))}
            />
          )}
          {rail === "later" && (
            <SideList
              empty="Save a message for later from the ⋮ menu."
              items={(laterQuery.data?.items ?? []).map((m) => ({
                id: m.id,
                title: m.userName,
                meta: m.body.slice(0, 80),
                onClick: () => goTo(m.channelId),
              }))}
            />
          )}
        </div>

        {inHuddle && huddle && (
          <div className="huddle-dock">
            <div className="who">
              <Headphones size={14} />
              Huddle in {active?.isDm ? active.name : `#${active?.name}`}
            </div>
            <div className="huddle-faces" style={{ marginBottom: 8 }}>
              {huddle.participants.map((p) => (
                <Avatar key={p.userId} as="span" className="av" name={p.name} image={p.image} />
              ))}
            </div>
            <div className="huddle-controls">
              <button onClick={toggleMic} title="Mute">
                {muted ? <MicOff /> : <Mic />}
              </button>
              <button onClick={toggleCam} title="Video">
                <Video />
              </button>
              <button title={sharing ? "Stop sharing" : "Share screen"} onClick={() => void shareScreen()}>
                <Screen />
              </button>
              {shareError ? <div className="login-error">{shareError}</div> : null}
              <button className="leave" onClick={() => void leaveHuddle()} title="Leave huddle">
                <Leave />
              </button>
            </div>
          </div>
        )}
      </aside>

      <section className="main">
        {dialog === "dm" ? (
          <NewMessagePane
            members={members}
            channels={channels}
            meId={me.id}
            onPickMember={(userId, body, file) => void openDm(userId, body, file)}
            onPickChannel={(channelId, body, file) => {
              const channel = channels.find((c) => c.id === channelId);
              goTo(channelId);
              setRail(channel?.isDm ? "dms" : "home");
              if (body || file) void sendPayload(channelId, body ?? "", file);
            }}
          />
        ) : active ? (
          <>
            <div className="ch-header">
              <div className="ch-title">
                {active.isDm ? (
                  active.name
                ) : (
                  <>
                    {active.isPrivate ? "🔒" : "#"} {active.name}
                  </>
                )}
                {active.topic ? <span className="meta">{active.topic}</span> : null}
              </div>
              <div className="ch-actions">
                <button
                  className={`hdr-btn huddle ${huddle?.active ? "live" : ""}`}
                  onClick={() => void joinHuddle()}
                >
                  <Headphones />
                  {huddle?.active ? huddle.participants.length : null}
                </button>
                <button className="hdr-btn" onClick={() => setDialog("members")}>
                  <Users /> {active.memberCount}
                </button>
                <button className="hdr-btn" onClick={() => setDialog("info")}>
                  <Info />
                </button>
              </div>
            </div>

            {huddle?.active && !inHuddle && (
              <div className="huddle-strip">
                <Headphones size={14} />
                {huddle.participants.map((p) => p.name.split(" ")[0]).join(", ")} in a huddle
                <button className="join" onClick={() => void joinHuddle()}>
                  Join
                </button>
              </div>
            )}

            <div className="msg-scroll" ref={scrollRef}>
              <MessageList
                messages={messages}
                members={memberMap}
                meId={me.id}
                channels={channels}
                onThread={(m) => void openThread(m)}
                onReact={(id, emoji) => wsRef.current?.send({ type: "reaction.toggle", messageId: id, emoji })}
                onProfile={(uid) => openProfile(uid)}
                onLater={(m) => void saveLater(m)}
                onForward={(m, channelId) => void sendPayload(channelId, m.body)}
                onEdit={(m, body) => void editMessage(m, body)}
                onDelete={(m) => void deleteMessage(m)}
              />
            </div>
            <div className="typing">{typing}</div>
            <Composer
              key={active.id}
              placeholder={active.isDm ? `Message ${active.name}` : `Message #${active.name}`}
              members={members}
              draftKey={active.id}
              onTyping={() => wsRef.current?.send({ type: "typing", channelId: active.id })}
              onSend={(body, file) => void sendPayload(active.id, body, file)}
            />
          </>
        ) : null}
      </section>

      {threadParent && active && !shownProfile && dialog !== "dm" && (
        <aside className="thread">
          <div className="thread-h">
            <h3>
              Thread <span className="ch">{active.isDm ? active.name : `#${active.name}`}</span>
            </h3>
            <button className="icon-btn" style={{ color: "#1d1c1d" }} onClick={() => setThread(null)}>
              <Close />
            </button>
          </div>
          <div className="msg-scroll">
            <MessageList
              messages={[threadParent, ...threadMsgs]}
              members={memberMap}
              meId={me.id}
              channels={channels}
              onThread={() => {}}
              hideThread
              onReact={(id, emoji) => wsRef.current?.send({ type: "reaction.toggle", messageId: id, emoji })}
              onProfile={(uid) => openProfile(uid)}
              onLater={(m) => void saveLater(m)}
              onForward={(m, channelId) => void sendPayload(channelId, m.body)}
              onEdit={(m, body) => void editMessage(m, body)}
              onDelete={(m) => void deleteMessage(m)}
            />
          </div>
          <Composer
            key={threadParent.id}
            placeholder="Reply…"
            members={members}
            draftKey={`${active.id}:${threadParent.id}`}
            onTyping={() =>
              wsRef.current?.send({ type: "typing", channelId: active.id, parentId: threadParent.id })
            }
            onSend={(body, file) => void sendPayload(active.id, body, file, threadParent.id)}
          />
        </aside>
      )}

      {shownProfile ? (
        <ProfilePane
          member={shownProfile}
          isSelf={shownProfile.userId === me.id}
          onClose={() => setProfile(null)}
          onMessage={() => void openDm(shownProfile.userId)}
          onSave={shownProfile.userId === me.id ? updateProfile : undefined}
          onUploadPhoto={shownProfile.userId === me.id ? uploadMyPhoto : undefined}
        />
      ) : null}

      {switcher && (
        <div className="modal-bg" onClick={() => setSwitcher(false)}>
          <div className="switcher" onClick={(e) => e.stopPropagation()}>
            <QuickSwitcher
              channels={channels}
              members={members}
              onPickChannel={(id) => {
                goTo(id);
                setSwitcher(false);
                setRail("home");
              }}
              onPickMember={(userId) => {
                void openDm(userId);
                setSwitcher(false);
              }}
              onPickMessage={(channelId) => {
                goTo(channelId);
                setSwitcher(false);
              }}
            />
          </div>
        </div>
      )}

      {dialog === "invite" && (
        <InviteDialog
          invites={invitesQuery.data?.invites ?? []}
          onInvite={async (email) => {
            const res = await api<{ invite: Invite }>("/api/invites", {
              method: "POST",
              body: JSON.stringify({ email, workspaceId: workspace.id }),
            });
            void qc.invalidateQueries({ queryKey: keys.invites(workspace.id) });
            return { url: res.invite.url };
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "channel" && (
        <ChannelDialog onCreate={createChannel} onClose={() => setDialog(null)} />
      )}
      {dialog === "members" && <MembersDialog members={members} onClose={() => setDialog(null)} />}
      {dialog === "info" && active && (
        <ChannelInfoDialog
          channel={active}
          starred={active.isStarred}
          onStar={() => void starActive()}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "self" && (
        <SelfMenu
          me={me}
          onSave={updateProfile}
          onSignOut={async () => {
            await signOut();
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "switcher" && (
        <div className="modal-bg switcher-bg" onClick={() => setDialog(null)}>
          <div className="ws-switcher" onClick={(e) => e.stopPropagation()} role="menu">
            {switcherRows.map((item, index) => (
              <button
                key={item.key}
                type="button"
                className={`ws-switcher-row${item.active ? " active" : ""}`}
                onClick={() => void openSwitcherItem(item)}
              >
                <span className={`ws-switcher-ico${item.active ? " on" : ""}`}>
                  <WorkspaceGlyph className="in-switcher" workspace={item.glyph} />
                </span>
                <span className="ws-switcher-copy">
                  <strong>{item.name}</strong>
                  <em>{item.subtitle}</em>
                </span>
                {index < 9 ? <kbd>⌘{index + 1}</kbd> : null}
              </button>
            ))}
            <div className="ws-switcher-sep" />
            <button
              type="button"
              className="ws-switcher-row"
              onClick={() => {
                setDialog(null);
                setAddWorkspace(true);
              }}
            >
              <span className="ws-switcher-ico add">
                <Plus size={20} />
              </span>
              <span className="ws-switcher-copy">
                <strong>Add a workspace</strong>
              </span>
            </button>
          </div>
        </div>
      )}
      {dialog === "workspace" && (
        <div className="modal-bg switcher-bg" onClick={() => setDialog(null)}>
          <div className="menu workspace-menu" role="menu" onClick={(e) => e.stopPropagation()}>
            <div className="ws-menu-head">
              <WorkspaceGlyph className="sm" workspace={workspace} />
              <div className="ws-menu-copy">
                <strong>{workspace.name}</strong>
                {me.email ? <em>{me.email}</em> : null}
              </div>
            </div>
            <div className="ws-menu-sep" />
            <button type="button" role="menuitem" onClick={() => setDialog("invite")}>
              Invite teammates
            </button>
            <button type="button" role="menuitem" onClick={() => setDialog("channel")}>
              Create a channel
            </button>
            <button type="button" role="menuitem" onClick={() => setDialog("workspace-settings")}>
              Workspace settings
            </button>
            <button type="button" role="menuitem" onClick={() => openProfile(me.id)}>
              Profile
            </button>
            <button type="button" role="menuitem" onClick={openHelpAndUpdates}>
              Keyboard shortcuts
            </button>
            <div className="ws-menu-sep" />
            <button
              type="button"
              role="menuitem"
              className="ws-menu-signout"
              onClick={async () => {
                await signOut();
              }}
            >
              Sign out
            </button>
          </div>
        </div>
      )}
      {addWorkspace ? (
        <AddWorkspaceDialog
          workspaces={workspaces}
          pendingInvites={meQuery.data?.pendingInvites ?? []}
          currentWorkspaceId={workspace.id}
          onSignInOther={() => {
            setAddWorkspace(false);
            setDialog(null);
            void window.relayDesktop.startAddAccount();
          }}
          onSelectWorkspace={async (id) => {
            await switchWorkspace(id);
            setAddWorkspace(false);
          }}
          onCreate={async (name) => {
            const created = await api<{ workspace: Workspace }>("/api/workspaces", {
              method: "POST",
              body: JSON.stringify({ name }),
            });
            await api(`/api/workspaces/${created.workspace.id}/select`, { method: "POST" });
            setActiveWorkspaceId(created.workspace.id);
            setActiveId(null);
            setThread(null);
            setAddWorkspace(false);
            await qc.invalidateQueries({ queryKey: keys.me });
          }}
          onJoinInvite={async (token) => {
            const res = await api<{ workspace: Workspace }>("/api/invites/accept", {
              method: "POST",
              body: JSON.stringify({ token }),
            });
            if (res.workspace?.id) await switchWorkspace(res.workspace.id);
            setAddWorkspace(false);
            await qc.invalidateQueries({ queryKey: keys.me });
          }}
          onAcceptInboxInvite={async (inviteId) => {
            const res = await api<{ workspace: Workspace }>("/api/invites/accept", {
              method: "POST",
              body: JSON.stringify({ inviteId }),
            });
            if (res.workspace?.id) await switchWorkspace(res.workspace.id);
            setAddWorkspace(false);
            await qc.invalidateQueries({ queryKey: keys.me });
          }}
          onClose={() => setAddWorkspace(false)}
        />
      ) : null}
      {dialog === "workspace-settings" && (
        <WorkspaceSettingsDialog
          workspace={workspace}
          canEdit={me.role === "owner" || me.role === "admin"}
          onSave={saveWorkspace}
          onUploadIcon={uploadWorkspaceIcon}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}

function toMember(me: Me): Member {
  return {
    id: me.id,
    userId: me.id,
    name: me.name,
    email: me.email ?? "",
    image: me.image,
    displayName: me.displayName,
    title: me.title,
    statusText: me.statusText,
    statusEmoji: me.statusEmoji,
    presence: (me.presence as Member["presence"]) || "active",
    role: (me.role as Member["role"]) || "member",
  };
}

function SelfMenu({
  me,
  onSave,
  onSignOut,
  onClose,
}: {
  me: Me;
  onSave: (patch: {
    displayName?: string;
    title?: string | null;
    statusText?: string | null;
    statusEmoji?: string | null;
  }) => Promise<void>;
  onSignOut: () => void;
  onClose: () => void;
}) {
  const [displayName, setDisplayName] = useState(me.displayName);
  const [title, setTitle] = useState(me.title ?? "");
  const [statusText, setStatusText] = useState(me.statusText ?? "");
  const [statusEmoji, setStatusEmoji] = useState(me.statusEmoji ?? "");
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h3>You</h3>
        <Avatar className="av self-photo" name={me.name} image={me.image} />
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await onSave({
              displayName,
              title: title || null,
              statusText: statusText || null,
              statusEmoji: statusEmoji || null,
            });
            onClose();
          }}
        >
          <label className="login-field">
            Display name
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </label>
          <label className="login-field">
            Title
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="login-field">
            Status
            <input
              value={statusText}
              onChange={(e) => setStatusText(e.target.value)}
              placeholder="What’s your status?"
            />
          </label>
          <label className="login-field">
            Status emoji
            <input value={statusEmoji} onChange={(e) => setStatusEmoji(e.target.value)} placeholder="🙂" />
          </label>
          <button type="submit" className="btn-primary">
            Save
          </button>
        </form>
        <button className="btn-ghost" type="button" onClick={onSignOut}>
          Sign out of Relay
        </button>
      </div>
    </div>
  );
}

function RailBtn({
  icon,
  label,
  active,
  onClick,
  badge,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  badge?: number;
}) {
  return (
    <button className={`rail-item ${active ? "active" : ""}`} onClick={onClick}>
      {icon}
      {label}
      {badge ? <span className="rail-badge">{badge}</span> : null}
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="section">
      <button className="section-h" onClick={() => setOpen((v) => !v)}>
        <Chevron
          size={12}
          strokeWidth="2.4"
          style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)" }}
        />
        {title}
      </button>
      {open ? children : null}
    </div>
  );
}

function peerForDm(channel: Channel, members: Map<string, Member>, meId: string) {
  const people = [...members.values()];
  const label = channel.dmName ?? channel.name;
  const first = label.split(",")[0]?.trim();
  const me = members.get(meId);
  if (me && (me.displayName === label || me.name === label)) return me;
  return people.find(
    (m) =>
      m.userId !== meId &&
      (m.displayName === label || m.name === label || m.displayName === first || m.name === first),
  );
}

function ChannelRow({
  c,
  active,
  onClick,
  members,
  meId,
}: {
  c: Channel;
  active: boolean;
  onClick: () => void;
  members: Map<string, Member>;
  meId: string;
}) {
  const unread = c.unreadCount > 0 || c.mentionCount > 0;
  let prefix: React.ReactNode = <span className="ch-hash">#</span>;
  if (c.isPrivate && !c.isDm) prefix = <span className="ch-hash">🔒</span>;
  if (c.isDm) {
    const other = peerForDm(c, members, meId);
    const name = other?.displayName || other?.name || c.dmName || c.name;
    prefix = (
      <span className="dm-avatar">
        <Avatar as="span" className="av" name={name} image={other?.image} />
        <i className={`presence ${other?.presence ?? "offline"}`} />
      </span>
    );
  }
  return (
    <button className={`ch-item ${active ? "active" : ""} ${unread ? "unread" : ""}`} onClick={onClick}>
      {prefix}
      <span className="label">{c.name}</span>
      {c.huddle?.active ? <Headphones size={12} /> : null}
      {c.mentionCount ? <span className="pill">{c.mentionCount}</span> : null}
      {!c.mentionCount && c.unreadCount ? <span className="pill">{c.unreadCount}</span> : null}
    </button>
  );
}

function SideList({
  items,
  empty,
}: {
  empty: string;
  items: { id: string; title: string; meta: string; onClick: () => void }[];
}) {
  if (!items.length) return <div className="sb-empty">{empty}</div>;
  return (
    <div className="side-list">
      {items.map((item) => (
        <button key={item.id} className="side-row" onClick={item.onClick}>
          <strong>{item.title}</strong>
          <span>{item.meta}</span>
        </button>
      ))}
    </div>
  );
}

function activityRow(i: ActivityItem, onClick: () => void) {
  const label =
    i.kind === "mention" ? "mentioned you" : i.kind === "reaction" ? `reacted ${i.emoji ?? ""}` : "thread reply";
  return {
    id: i.id,
    title: `${i.message.userName} ${label}`,
    meta: `#${i.channelName} · ${i.message.body.slice(0, 60)}`,
    onClick,
  };
}

function listDrafts(channels: Channel[]) {
  const names = new Map(channels.map((c) => [c.id, c.isDm ? c.name : `#${c.name}`]));
  const out: { channelId: string; name: string; body: string }[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k?.startsWith("draft:")) continue;
    const body = localStorage.getItem(k)?.trim();
    if (!body) continue;
    const channelId = k.slice("draft:".length).split(":")[0];
    out.push({ channelId, name: names.get(channelId) ?? "Draft", body });
  }
  return out;
}

function QuickSwitcher({
  channels,
  members,
  onPickChannel,
  onPickMember,
  onPickMessage,
}: {
  channels: Channel[];
  members: Member[];
  onPickChannel: (id: string) => void;
  onPickMember: (userId: string) => void;
  onPickMessage: (channelId: string) => void;
}) {
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const filtered = channels.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()));

  useEffect(() => {
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    const t = window.setTimeout(() => {
      void api<{ hits: SearchHit[] }>(`/api/search?q=${encodeURIComponent(q.trim())}`).then((res) =>
        setHits(res.hits),
      );
    }, 180);
    return () => window.clearTimeout(t);
  }, [q]);

  const rows: { key: string; label: string; run: () => void }[] =
    q.trim().length < 2
      ? filtered.map((c) => ({
          key: c.id,
          label: `${c.isDm ? "●" : c.isPrivate ? "🔒" : "#"} ${c.name}`,
          run: () => onPickChannel(c.id),
        }))
      : hits.map((h) => ({
          key: `${h.kind}-${h.id}`,
          label:
            h.kind === "message"
              ? `${h.title}: ${h.snippet ?? ""}`
              : h.kind === "member"
                ? `@${h.title}`
                : h.title,
          run: () => {
            if (h.kind === "member" && h.userId) onPickMember(h.userId);
            else if (h.channelId) onPickMessage(h.channelId);
          },
        }));

  const memberHits =
    q.trim().length >= 1
      ? members.filter((m) => m.displayName.toLowerCase().includes(q.toLowerCase())).slice(0, 5)
      : [];

  return (
    <>
      <input
        autoFocus
        placeholder="Jump to… or type a search query"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setIdx(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setIdx((i) => Math.min(rows.length - 1, i + 1));
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setIdx((i) => Math.max(0, i - 1));
          }
          if (e.key === "Enter" && rows[idx]) rows[idx].run();
        }}
      />
      <div className="switcher-list">
        {rows.map((row, i) => (
          <button
            key={row.key}
            className={`switcher-row ${i === idx ? "active" : ""}`}
            onMouseEnter={() => setIdx(i)}
            onClick={row.run}
          >
            {row.label}
          </button>
        ))}
        {memberHits.map((m) => (
          <button key={m.userId} className="switcher-row" onClick={() => onPickMember(m.userId)}>
            @{m.displayName}
          </button>
        ))}
      </div>
    </>
  );
}

declare global {
  interface Window {
    electron?: boolean;
  }
}

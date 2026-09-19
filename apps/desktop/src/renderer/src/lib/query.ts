import { QueryClient } from "@tanstack/react-query";
import type { Channel, ChatMessage, Workspace, Member, WsServerEvent } from "@relay/shared";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 5_000 },
  },
});

export const keys = {
  me: ["me"] as const,
  bootstrap: (wsId: string) => ["bootstrap", wsId] as const,
  messages: (channelId: string, parentId: string | null) => ["messages", channelId, parentId] as const,
  activity: ["activity"] as const,
  files: ["files"] as const,
  later: ["later"] as const,
  threads: ["threads"] as const,
  invites: ["invites"] as const,
};

export type Me = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  displayName: string;
  title: string | null;
  statusText: string | null;
  statusEmoji: string | null;
  presence: string;
  role: string;
};

export type Bootstrap = { workspace: Workspace; members: Member[]; channels: Channel[] };

export function applyWsEvent(ev: WsServerEvent, meId: string) {
  if (ev.type === "message.created") {
    const parentId = ev.message.parentId ?? null;
    queryClient.setQueryData<{ messages: ChatMessage[] }>(keys.messages(ev.message.channelId, parentId), (old) => {
      const list = old?.messages ?? [];
      const byClient = ev.message.clientId
        ? list.findIndex((m) => m.clientId === ev.message.clientId || m.id === ev.message.clientId)
        : -1;
      const byId = list.findIndex((m) => m.id === ev.message.id);
      if (byClient >= 0) {
        const next = list.slice();
        next[byClient] = { ...ev.message, pending: false };
        return { messages: next };
      }
      if (byId >= 0) return old;
      return { messages: [...list, ev.message] };
    });
    if (parentId) {
      queryClient.setQueryData<{ messages: ChatMessage[] }>(keys.messages(ev.message.channelId, null), (old) => {
        if (!old) return old;
        return {
          messages: old.messages.map((m) =>
            m.id === parentId
              ? {
                  ...m,
                  replyCount: m.replyCount + 1,
                  latestReplyAt: ev.message.createdAt,
                  replyUserIds: m.replyUserIds.includes(ev.message.userId)
                    ? m.replyUserIds
                    : [...m.replyUserIds, ev.message.userId],
                }
              : m,
          ),
        };
      });
    }
    queryClient.setQueriesData<Bootstrap>({ queryKey: ["bootstrap"] }, (boot) => {
      if (!boot) return boot;
      return {
        ...boot,
        channels: boot.channels.map((c) =>
          c.id === ev.message.channelId && ev.message.userId !== meId && !parentId
            ? { ...c, unreadCount: c.unreadCount + 1 }
            : c,
        ),
      };
    });
  }
  if (ev.type === "message.updated") {
    const parentId = ev.message.parentId ?? null;
    queryClient.setQueryData<{ messages: ChatMessage[] }>(keys.messages(ev.message.channelId, parentId), (old) => {
      if (!old) return old;
      return { messages: old.messages.map((m) => (m.id === ev.message.id ? ev.message : m)) };
    });
    queryClient.setQueryData<{ messages: ChatMessage[] }>(keys.messages(ev.message.channelId, null), (old) => {
      if (!old) return old;
      return { messages: old.messages.map((m) => (m.id === ev.message.id ? { ...m, ...ev.message } : m)) };
    });
  }
  if (ev.type === "message.deleted") {
    queryClient.setQueryData<{ messages: ChatMessage[] }>(
      keys.messages(ev.channelId, ev.parentId ?? null),
      (old) => (old ? { messages: old.messages.filter((m) => m.id !== ev.messageId) } : old),
    );
  }
  if (ev.type === "presence") {
    queryClient.setQueriesData<Bootstrap>({ queryKey: ["bootstrap"] }, (boot) => {
      if (!boot) return boot;
      return {
        ...boot,
        members: boot.members.map((m) => (m.userId === ev.userId ? { ...m, presence: ev.presence } : m)),
      };
    });
  }
  if (ev.type === "huddle.updated") {
    queryClient.setQueriesData<Bootstrap>({ queryKey: ["bootstrap"] }, (boot) => {
      if (!boot) return boot;
      return {
        ...boot,
        channels: boot.channels.map((c) => (c.id === ev.channelId ? { ...c, huddle: ev.huddle } : c)),
      };
    });
  }
  if (ev.type === "unread") {
    queryClient.setQueriesData<Bootstrap>({ queryKey: ["bootstrap"] }, (boot) => {
      if (!boot) return boot;
      return {
        ...boot,
        channels: boot.channels.map((c) =>
          c.id === ev.channelId ? { ...c, unreadCount: ev.unreadCount, mentionCount: ev.mentionCount } : c,
        ),
      };
    });
  }
  if (ev.type === "channel.created") {
    queryClient.setQueriesData<Bootstrap>({ queryKey: ["bootstrap"] }, (boot) => {
      if (!boot) return boot;
      if (boot.channels.some((c) => c.id === ev.channel.id)) return boot;
      return { ...boot, channels: [...boot.channels, ev.channel] };
    });
  }
  if (ev.type === "workspace.updated") {
    queryClient.setQueryData<{ user: Me; workspace: Workspace | null }>(keys.me, (old) =>
      old ? { ...old, workspace: ev.workspace } : old,
    );
    queryClient.setQueriesData<Bootstrap>({ queryKey: ["bootstrap"] }, (boot) =>
      boot ? { ...boot, workspace: ev.workspace } : boot,
    );
  }
  if (ev.type === "member.updated") {
    queryClient.setQueriesData<Bootstrap>({ queryKey: ["bootstrap"] }, (boot) => {
      if (!boot) return boot;
      return {
        ...boot,
        members: boot.members.map((m) => (m.userId === ev.member.userId ? ev.member : m)),
      };
    });
    queryClient.setQueryData<{ user: Me; workspace: Workspace | null }>(keys.me, (old) => {
      if (!old?.user || old.user.id !== ev.member.userId) return old;
      return {
        ...old,
        user: {
          ...old.user,
          name: ev.member.name,
          image: ev.member.image,
          displayName: ev.member.displayName,
          title: ev.member.title,
          statusText: ev.member.statusText,
          statusEmoji: ev.member.statusEmoji,
          presence: ev.member.presence,
        },
      };
    });
  }
  if (ev.type === "member.joined") {
    queryClient.setQueriesData<Bootstrap>({ queryKey: ["bootstrap"] }, (boot) => {
      if (!boot) return boot;
      if (boot.members.some((m) => m.userId === ev.member.userId)) return boot;
      return { ...boot, members: [...boot.members, ev.member] };
    });
  }
}

import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import * as Notifications from "expo-notifications";
import type { Channel, ChatMessage, Member, Workspace, WorkspaceSummary, WsClientEvent } from "@relay/shared";
import { useAccounts } from "./account-manager";
import { api } from "./auth";
import { applyWsEvent, keys, queryClient, setActiveWorkspaceId, type Bootstrap, type Me, type MeResponse } from "./query";
import { peekPendingNav } from "./pending-nav";
import { addRealtimeListener, sendRealtime } from "./realtime-hub";
import { colors } from "../ui/theme";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

type Ctx = {
  me: Me;
  workspace: Workspace;
  workspaces: WorkspaceSummary[];
  members: Member[];
  channels: Channel[];
  bootstrap: Bootstrap;
  sendWs: (event: WsClientEvent) => void;
  memberById: (id: string) => Member | undefined;
  channelById: (id: string) => Channel | undefined;
  selectWorkspace: (workspaceId: string) => Promise<void>;
};

const WorkspaceCtx = createContext<Ctx | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { activeAccountId } = useAccounts();
  const meQ = useQuery({
    queryKey: keys.me,
    queryFn: () => api<MeResponse>("/api/me"),
  });
  const workspace = meQ.data?.workspace ?? null;
  const workspaces = meQ.data?.workspaces ?? [];
  setActiveWorkspaceId(meQ.data?.activeWorkspaceId ?? workspace?.id ?? null);
  const bootQ = useQuery({
    queryKey: keys.bootstrap(workspace?.id ?? ""),
    enabled: Boolean(workspace),
    queryFn: () => api<Bootstrap>(`/api/workspaces/${workspace!.id}/bootstrap`),
  });
  const meId = meQ.data?.user.id;

  useEffect(() => {
    if (!meId || !activeAccountId) return;
    return addRealtimeListener((ev, accountId) => {
      if (accountId !== activeAccountId) return;
      applyWsEvent(ev, meId);
    });
  }, [meId, activeAccountId]);

  useEffect(() => {
    const pending = peekPendingNav();
    if (!pending?.workspaceId || !bootQ.data || !activeAccountId) return;
    if (pending.accountId !== activeAccountId) return;
    if (pending.workspaceId === bootQ.data.workspace.id) return;
    void api(`/api/workspaces/${pending.workspaceId}/select`, { method: "POST" }).then(async () => {
      setActiveWorkspaceId(pending.workspaceId!);
      await queryClient.invalidateQueries({ queryKey: keys.me });
    });
  }, [bootQ.data?.workspace.id, activeAccountId]);

  const value = useMemo<Ctx | null>(() => {
    if (!meQ.data?.user || !bootQ.data || !activeAccountId) return null;
    const boot = bootQ.data;
    return {
      me: meQ.data.user,
      workspace: boot.workspace,
      workspaces,
      members: boot.members,
      channels: boot.channels,
      bootstrap: boot,
      sendWs: (ev) => sendRealtime(ev, activeAccountId),
      memberById: (id) => boot.members.find((m) => m.userId === id),
      channelById: (id) => boot.channels.find((c) => c.id === id),
      selectWorkspace: async (nextId: string) => {
        if (nextId === boot.workspace.id) return;
        await api(`/api/workspaces/${nextId}/select`, { method: "POST" });
        setActiveWorkspaceId(nextId);
        sendRealtime({ type: "workspace.select", workspaceId: nextId }, activeAccountId);
        await queryClient.invalidateQueries({ queryKey: keys.me });
      },
    };
  }, [meQ.data, bootQ.data, workspaces, activeAccountId]);

  if (!value) {
    const failed =
      (!meQ.data && (meQ.isError || meQ.fetchStatus === "paused")) ||
      (!bootQ.data && (bootQ.isError || bootQ.fetchStatus === "paused"));
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12, backgroundColor: colors.canvas }}>
        {failed ? (
          <>
            <Text style={{ color: colors.ink, fontSize: 16, fontWeight: "600" }}>Can't reach Relay</Text>
            <Pressable
              onPress={() => {
                void meQ.refetch();
                void bootQ.refetch();
              }}
              style={{ paddingHorizontal: 16, paddingVertical: 10 }}
            >
              <Text style={{ color: colors.accent, fontWeight: "700" }}>Retry</Text>
            </Pressable>
          </>
        ) : (
          <ActivityIndicator color={colors.aubergine} />
        )}
      </View>
    );
  }
  return <WorkspaceCtx.Provider value={value}>{children}</WorkspaceCtx.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceCtx);
  if (!ctx) throw new Error("WorkspaceProvider missing");
  return ctx;
}

export async function sendMessage(opts: {
  channelId: string;
  body: string;
  parentId?: string | null;
  clientId: string;
  fileKey?: string;
  fileName?: string;
  fileContentType?: string;
}) {
  return api<{ message: ChatMessage }>(`/api/channels/${opts.channelId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      body: opts.body,
      parentId: opts.parentId,
      clientId: opts.clientId,
      fileKey: opts.fileKey,
      fileName: opts.fileName,
      fileContentType: opts.fileContentType,
    }),
  });
}

import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import { ActivityIndicator, Platform, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import * as Notifications from "expo-notifications";
import type { Channel, ChatMessage, Member, Workspace, WorkspaceSummary } from "@relay/shared";
import { api } from "./auth";
import { applyWsEvent, keys, queryClient, setActiveWorkspaceId, type Bootstrap, type Me, type MeResponse } from "./query";
import { connectWs } from "./ws";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

type Conn = ReturnType<typeof connectWs>;

type Ctx = {
  me: Me;
  workspace: Workspace;
  workspaces: WorkspaceSummary[];
  members: Member[];
  channels: Channel[];
  bootstrap: Bootstrap;
  sendWs: Conn["send"];
  memberById: (id: string) => Member | undefined;
  channelById: (id: string) => Channel | undefined;
  selectWorkspace: (workspaceId: string) => Promise<void>;
};

const WorkspaceCtx = createContext<Ctx | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
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
  const conn = useRef<Conn | null>(null);
  const meId = meQ.data?.user.id;
  const workspaceId = workspace?.id ?? null;
  const channelIds = (bootQ.data?.channels ?? []).map((c) => c.id);
  const channelKey = channelIds.slice().sort().join("|");
  const idsRef = useRef<string[]>([]);
  idsRef.current = channelIds;

  useEffect(() => {
    if (!meId) return;
    const c = connectWs(
      (ev) => applyWsEvent(ev, meId),
      () => {
        if (workspaceId) c.send({ type: "workspace.select", workspaceId });
        for (const id of idsRef.current) c.send({ type: "subscribe", channelId: id });
      },
    );
    conn.current = c;
    return () => {
      c.close();
      conn.current = null;
    };
  }, [meId]);

  useEffect(() => {
    if (workspaceId) conn.current?.send({ type: "workspace.select", workspaceId });
    for (const id of idsRef.current) conn.current?.send({ type: "subscribe", channelId: id });
  }, [channelKey, workspaceId]);

  useEffect(() => {
    if (!meId) return;
    void registerPush();
  }, [meId]);

  const value = useMemo<Ctx | null>(() => {
    if (!meQ.data?.user || !bootQ.data) return null;
    const boot = bootQ.data;
    return {
      me: meQ.data.user,
      workspace: boot.workspace,
      workspaces,
      members: boot.members,
      channels: boot.channels,
      bootstrap: boot,
      sendWs: (ev) => conn.current?.send(ev),
      memberById: (id) => boot.members.find((m) => m.userId === id),
      channelById: (id) => boot.channels.find((c) => c.id === id),
      selectWorkspace: async (nextId: string) => {
        if (nextId === boot.workspace.id) return;
        await api(`/api/workspaces/${nextId}/select`, { method: "POST" });
        setActiveWorkspaceId(nextId);
        conn.current?.send({ type: "workspace.select", workspaceId: nextId });
        queryClient.removeQueries({ queryKey: ["bootstrap"] });
        queryClient.removeQueries({ queryKey: ["messages"] });
        await queryClient.invalidateQueries({ queryKey: keys.me });
      },
    };
  }, [meQ.data, bootQ.data, workspaces]);

  if (!value) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color="#fff" />
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

async function registerPush() {
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== "granted") return;
    const device = await Notifications.getExpoPushTokenAsync();
    await api("/api/device-tokens", {
      method: "POST",
      body: JSON.stringify({ token: device.data, platform: Platform.OS }),
    });
  } catch {
    /* simulator */
  }
}

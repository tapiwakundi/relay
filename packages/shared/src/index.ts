export type Presence = "active" | "away" | "dnd" | "offline";

export type Member = {
  id: string;
  userId: string;
  name: string;
  email: string;
  image: string | null;
  displayName: string;
  title: string | null;
  statusText: string | null;
  statusEmoji: string | null;
  presence: Presence;
  role: "owner" | "admin" | "member" | "guest";
};

export type Workspace = {
  id: string;
  name: string;
  slug: string;
  iconColor: string;
  iconLetter: string;
  iconUrl: string | null;
  plan: string;
};

export type WorkspaceSummary = Workspace & {
  role: Member["role"];
  unreadTotal?: number;
  mentionTotal?: number;
};

export type Channel = {
  id: string;
  workspaceId: string;
  name: string;
  topic: string | null;
  description: string | null;
  isPrivate: boolean;
  isDm: boolean;
  isMpim: boolean;
  dmName: string | null;
  unreadCount: number;
  mentionCount: number;
  isMuted: boolean;
  isStarred: boolean;
  section: "starred" | "channels" | "direct";
  huddle: Huddle | null;
  memberCount: number;
};

export type Reaction = {
  emoji: string;
  count: number;
  userIds: string[];
};

export type ChatMessage = {
  id: string;
  channelId: string;
  parentId: string | null;
  userId: string;
  userName: string;
  userImage: string | null;
  userStatusEmoji: string | null;
  body: string;
  createdAt: string;
  updatedAt: string | null;
  edited: boolean;
  deleted?: boolean;
  replyCount: number;
  latestReplyAt: string | null;
  replyUserIds: string[];
  reactions: Reaction[];
  fileKey?: string | null;
  fileName?: string | null;
  fileContentType?: string | null;
  fileUrl?: string | null;
  attachmentId?: string | null;
  pending?: boolean;
  clientId?: string | null;
  failed?: boolean;
};

export type MessagePage = {
  messages: ChatMessage[];
  huddle?: Huddle | null;
  nextCursor: string | null;
  hasMore: boolean;
};

export type HuddleParticipant = {
  userId: string;
  name: string;
  image: string | null;
  muted: boolean;
  cameraOn: boolean;
};

export type Huddle = {
  id: string;
  channelId: string;
  startedBy: string;
  active: boolean;
  livekitRoom: string;
  participants: HuddleParticipant[];
  startedAt: string;
};

export type WsClientEvent =
  | { type: "hello"; token?: string }
  | { type: "workspace.select"; workspaceId: string }
  | { type: "subscribe"; channelId: string }
  | { type: "unsubscribe"; channelId: string }
  | { type: "watch"; channelId: string }
  | { type: "unwatch"; channelId: string }
  | { type: "message.send"; channelId: string; body: string; parentId?: string | null; clientId?: string; fileKey?: string; fileName?: string; fileContentType?: string }
  | { type: "typing"; channelId: string; parentId?: string | null }
  | { type: "reaction.toggle"; messageId: string; emoji: string }
  | { type: "huddle.join"; channelId: string }
  | { type: "huddle.leave"; channelId: string }
  | { type: "presence.set"; presence: Presence };

export type Invite = {
  id: string;
  workspaceId: string;
  email: string;
  invitedBy: string;
  token: string;
  status: "pending" | "accepted" | "expired" | "revoked";
  url: string;
  createdAt: string;
};

export type ActivityItem = {
  id: string;
  kind: "mention" | "reaction" | "thread";
  at: string;
  channelId: string;
  channelName: string;
  message: ChatMessage;
  actorName?: string;
  emoji?: string;
};

export type FileItem = {
  messageId: string;
  channelId: string;
  channelName: string;
  fileKey: string;
  fileName: string;
  fileContentType: string | null;
  fileUrl: string | null;
  userName: string;
  createdAt: string;
};

export type SearchHit = {
  kind: "channel" | "message" | "member";
  id: string;
  title: string;
  snippet?: string;
  channelId?: string;
  userId?: string;
};

export type MeUser = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  displayName: string;
  title: string | null;
  statusText: string | null;
  statusEmoji: string | null;
  presence: Presence;
  role: Member["role"];
};

export type MeResponse = {
  user: MeUser;
  workspaces: WorkspaceSummary[];
  activeWorkspaceId: string | null;
  membership: Member | null;
  workspace: Workspace | null;
};

export type WsServerEvent =
  | { type: "ready"; userId: string; activeWorkspaceId: string | null }
  | { type: "error"; message: string }
  | { type: "message.created"; message: ChatMessage }
  | { type: "message.updated"; message: ChatMessage }
  | { type: "message.deleted"; messageId: string; channelId: string; parentId?: string | null }
  | { type: "typing"; channelId: string; userId: string; userName: string; parentId?: string | null }
  | { type: "presence"; workspaceId: string; userId: string; presence: Presence }
  | { type: "huddle.updated"; huddle: Huddle | null; channelId: string; workspaceId?: string }
  | { type: "unread"; channelId: string; unreadCount: number; mentionCount: number; workspaceId?: string }
  | { type: "channel.created"; channel: Channel; workspaceId?: string }
  | { type: "workspace.updated"; workspace: Workspace }
  | { type: "member.updated"; workspaceId: string; member: Member }
  | { type: "member.joined"; workspaceId: string; member: Member };

export const EMOJI_QUICK = ["👍", "❤️", "😂", "🎉", "👀", "🔥", "✅", "🙌"] as const;

export type RelayAccountId = string;

export type RelayAccountSummary = {
  id: RelayAccountId;
  email: string;
  name: string;
  image: string | null;
  activeWorkspaceId: string | null;
  unreadTotal: number;
  mentionTotal: number;
};

export type RelayAccountSession = {
  accountId: RelayAccountId;
  cookie?: string;
  token?: string;
};

export type WatchChannel = {
  id: string;
  workspaceId: string;
};

export type PushNotificationData = {
  accountId: RelayAccountId;
  workspaceId: string;
  channelId: string;
  messageId?: string;
};

export type AccountNavigation = {
  accountId: RelayAccountId;
  workspaceId?: string;
  channelId: string;
};

export function unreadTotals(workspaces: { unreadTotal?: number; mentionTotal?: number }[]) {
  let unreadTotal = 0;
  let mentionTotal = 0;
  for (const ws of workspaces) {
    unreadTotal += ws.unreadTotal ?? 0;
    mentionTotal += ws.mentionTotal ?? 0;
  }
  return { unreadTotal, mentionTotal };
}

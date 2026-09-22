import type { ChatMessage } from "@relay/shared";

export function newClientId() {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj?.randomUUID) return cryptoObj.randomUUID();
  return `c-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function optimisticMessage(input: {
  clientId: string;
  channelId: string;
  parentId: string | null;
  userId: string;
  userName: string;
  userImage: string | null;
  userStatusEmoji: string | null;
  body: string;
  fileKey?: string | null;
  fileName?: string | null;
  fileContentType?: string | null;
  now?: string;
}): ChatMessage {
  return {
    id: input.clientId,
    channelId: input.channelId,
    parentId: input.parentId,
    userId: input.userId,
    userName: input.userName,
    userImage: input.userImage,
    userStatusEmoji: input.userStatusEmoji,
    body: input.body,
    createdAt: input.now ?? new Date().toISOString(),
    updatedAt: null,
    edited: false,
    replyCount: 0,
    latestReplyAt: null,
    replyUserIds: [],
    reactions: [],
    pending: true,
    clientId: input.clientId,
    fileKey: input.fileKey,
    fileName: input.fileName,
    fileContentType: input.fileContentType,
  };
}

export function withFailedPending(messages: ChatMessage[], clientId: string): ChatMessage[] {
  return messages.map((message) =>
    message.clientId === clientId && message.pending ? { ...message, pending: false, failed: true } : message,
  );
}

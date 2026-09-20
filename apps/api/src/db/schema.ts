import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const channelKind = pgEnum("channel_kind", ["public", "private", "dm", "mpim"]);
export const workspaceRole = pgEnum("workspace_role", ["owner", "admin", "member", "guest"]);
export const presenceKind = pgEnum("presence_kind", ["active", "away", "dnd", "offline"]);
export const inviteStatus = pgEnum("invite_status", ["pending", "accepted", "expired", "revoked"]);
export const devicePlatform = pgEnum("device_platform", ["ios", "android", "desktop", "web"]);
export const attachmentPurpose = pgEnum("attachment_purpose", [
  "message",
  "avatar",
  "workspace_icon",
  "other",
]);

const timestamptz = (name: string) => timestamp(name, { withTimezone: true });

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
  updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  deletedAt: timestamptz("deleted_at"),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamptz("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_id_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    issuer: text("issuer").notNull().default(""),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamptz("access_token_expires_at"),
    refreshTokenExpiresAt: timestamptz("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("account_user_id_idx").on(t.userId),
    uniqueIndex("account_issuer_account_id_uidx").on(t.issuer, t.accountId),
    uniqueIndex("account_provider_account_uidx").on(t.providerId, t.accountId),
  ],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamptz("expires_at").notNull(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

export const workspace = pgTable(
  "workspace",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    iconColor: text("icon_color").notNull().default("#4A154B"),
    iconLetter: text("icon_letter").notNull().default("R"),
    iconKey: text("icon_key"),
    plan: text("plan").notNull().default("Pro"),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
    deletedAt: timestamptz("deleted_at"),
  },
  (t) => [
    uniqueIndex("workspace_slug_alive_uidx").on(t.slug).where(sql`${t.deletedAt} is null`),
    index("workspace_created_by_idx").on(t.createdBy),
  ],
);

export const userPreference = pgTable("user_preference", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  activeWorkspaceId: uuid("active_workspace_id").references(() => workspace.id, { onDelete: "set null" }),
  updatedAt: timestamptz("updated_at").notNull().defaultNow(),
});

export const workspaceMember = pgTable(
  "workspace_member",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    role: workspaceRole("role").notNull().default("member"),
    displayName: text("display_name").notNull(),
    title: text("title"),
    statusText: text("status_text"),
    statusEmoji: text("status_emoji"),
    presence: presenceKind("presence").notNull().default("offline"),
    joinedAt: timestamptz("joined_at").notNull().defaultNow(),
    leftAt: timestamptz("left_at"),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.userId] }),
    index("workspace_member_user_active_idx").on(t.userId).where(sql`${t.leftAt} is null`),
    index("workspace_member_workspace_active_idx").on(t.workspaceId).where(sql`${t.leftAt} is null`),
  ],
);

export const channel = pgTable(
  "channel",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    kind: channelKind("kind").notNull().default("public"),
    name: text("name").notNull(),
    topic: text("topic"),
    description: text("description"),
    dmKey: text("dm_key"),
    mpimKey: text("mpim_key"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
    deletedAt: timestamptz("deleted_at"),
  },
  (t) => [
    index("channel_workspace_alive_idx").on(t.workspaceId).where(sql`${t.deletedAt} is null`),
    index("channel_workspace_kind_idx").on(t.workspaceId, t.kind),
    uniqueIndex("channel_id_workspace_uidx").on(t.id, t.workspaceId),
    uniqueIndex("channel_name_alive_uidx")
      .on(t.workspaceId, t.name)
      .where(sql`${t.kind} in ('public', 'private') and ${t.deletedAt} is null`),
    uniqueIndex("channel_dm_key_uidx")
      .on(t.workspaceId, t.dmKey)
      .where(sql`${t.kind} = 'dm' and ${t.deletedAt} is null`),
    uniqueIndex("channel_mpim_key_uidx")
      .on(t.workspaceId, t.mpimKey)
      .where(sql`${t.kind} = 'mpim' and ${t.deletedAt} is null`),
    check(
      "channel_dm_key_ck",
      sql`(${t.kind} = 'dm') = (${t.dmKey} is not null) and (${t.kind} = 'mpim') = (${t.mpimKey} is not null)`,
    ),
  ],
);

export const channelMember = pgTable(
  "channel_member",
  {
    channelId: uuid("channel_id")
      .notNull()
      .references(() => channel.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    lastReadAt: timestamptz("last_read_at"),
    isStarred: boolean("is_starred").notNull().default(false),
    isMuted: boolean("is_muted").notNull().default(false),
    unreadCount: integer("unread_count").notNull().default(0),
    mentionCount: integer("mention_count").notNull().default(0),
    leftAt: timestamptz("left_at"),
  },
  (t) => [
    primaryKey({ columns: [t.channelId, t.userId] }),
    foreignKey({
      name: "channel_member_workspace_member_fk",
      columns: [t.workspaceId, t.userId],
      foreignColumns: [workspaceMember.workspaceId, workspaceMember.userId],
    }).onDelete("cascade"),
    foreignKey({
      name: "channel_member_channel_workspace_fk",
      columns: [t.channelId, t.workspaceId],
      foreignColumns: [channel.id, channel.workspaceId],
    }).onDelete("cascade"),
    index("channel_member_user_active_idx").on(t.userId, t.channelId).where(sql`${t.leftAt} is null`),
    index("channel_member_channel_active_idx").on(t.channelId).where(sql`${t.leftAt} is null`),
    index("channel_member_workspace_user_idx").on(t.workspaceId, t.userId),
    check("channel_member_unread_ck", sql`${t.unreadCount} >= 0`),
    check("channel_member_mention_ck", sql`${t.mentionCount} >= 0`),
  ],
);

export const message = pgTable(
  "message",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    channelId: uuid("channel_id")
      .notNull()
      .references(() => channel.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id"),
    authorUserId: text("author_user_id").references(() => user.id, { onDelete: "set null" }),
    authorDisplayName: text("author_display_name").notNull(),
    authorAvatarKey: text("author_avatar_key"),
    body: text("body").notNull().default(""),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at"),
    deletedAt: timestamptz("deleted_at"),
    deletedBy: text("deleted_by").references(() => user.id, { onDelete: "set null" }),
  },
  (t) => [
    uniqueIndex("message_id_channel_uidx").on(t.id, t.channelId),
    foreignKey({
      name: "message_parent_same_channel_fk",
      columns: [t.parentId, t.channelId],
      foreignColumns: [t.id, t.channelId],
    }).onDelete("set null"),
    foreignKey({
      name: "message_channel_workspace_fk",
      columns: [t.channelId, t.workspaceId],
      foreignColumns: [channel.id, channel.workspaceId],
    }).onDelete("cascade"),
    index("message_channel_created_idx")
      .on(t.channelId, t.createdAt)
      .where(sql`${t.deletedAt} is null`),
    index("message_channel_parent_created_idx").on(t.channelId, t.parentId, t.createdAt),
    index("message_parent_idx").on(t.parentId).where(sql`${t.parentId} is not null`),
    index("message_workspace_created_idx")
      .on(t.workspaceId, t.createdAt)
      .where(sql`${t.deletedAt} is null`),
    check("message_not_own_parent_ck", sql`${t.parentId} is distinct from ${t.id}`),
  ],
);

export const attachment = pgTable(
  "attachment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    uploadedBy: text("uploaded_by").references(() => user.id, { onDelete: "set null" }),
    storageKey: text("storage_key").notNull().unique(),
    fileName: text("file_name").notNull(),
    contentType: text("content_type"),
    byteSize: bigint("byte_size", { mode: "number" }),
    purpose: attachmentPurpose("purpose").notNull().default("message"),
    messageId: uuid("message_id").references(() => message.id, { onDelete: "set null" }),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    deletedAt: timestamptz("deleted_at"),
  },
  (t) => [
    index("attachment_workspace_created_idx").on(t.workspaceId, t.createdAt),
    index("attachment_message_idx").on(t.messageId).where(sql`${t.messageId} is not null`),
    index("attachment_uploader_idx").on(t.uploadedBy).where(sql`${t.deletedAt} is null`),
    check("attachment_size_ck", sql`${t.byteSize} is null or ${t.byteSize} >= 0`),
  ],
);

export const reaction = pgTable(
  "reaction",
  {
    messageId: uuid("message_id")
      .notNull()
      .references(() => message.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    emoji: text("emoji").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.messageId, t.userId, t.emoji] }),
    index("reaction_message_idx").on(t.messageId),
  ],
);

export const huddle = pgTable(
  "huddle",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    channelId: uuid("channel_id")
      .notNull()
      .references(() => channel.id, { onDelete: "cascade" }),
    startedBy: text("started_by").references(() => user.id, { onDelete: "set null" }),
    livekitRoom: text("livekit_room").notNull().unique(),
    startedAt: timestamptz("started_at").notNull().defaultNow(),
    endedAt: timestamptz("ended_at"),
  },
  (t) => [
    uniqueIndex("huddle_one_open_per_channel_uidx").on(t.channelId).where(sql`${t.endedAt} is null`),
    index("huddle_channel_started_idx").on(t.channelId, t.startedAt),
  ],
);

export const huddleParticipant = pgTable(
  "huddle_participant",
  {
    huddleId: uuid("huddle_id")
      .notNull()
      .references(() => huddle.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    muted: boolean("muted").notNull().default(false),
    cameraOn: boolean("camera_on").notNull().default(false),
    joinedAt: timestamptz("joined_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.huddleId, t.userId] })],
);

export const invite = pgTable(
  "invite",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    invitedBy: text("invited_by").references(() => user.id, { onDelete: "set null" }),
    token: text("token").notNull().unique(),
    status: inviteStatus("status").notNull().default("pending"),
    expiresAt: timestamptz("expires_at").notNull(),
    acceptedAt: timestamptz("accepted_at"),
    acceptedBy: text("accepted_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("invite_pending_email_uidx")
      .on(t.workspaceId, t.email)
      .where(sql`${t.status} = 'pending'`),
    index("invite_workspace_status_idx").on(t.workspaceId, t.status),
    index("invite_email_pending_idx").on(t.email).where(sql`${t.status} = 'pending'`),
  ],
);

export const savedItem = pgTable(
  "saved_item",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    messageId: uuid("message_id")
      .notNull()
      .references(() => message.id, { onDelete: "cascade" }),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.messageId] }),
    index("saved_item_user_created_idx").on(t.userId, t.createdAt),
  ],
);

export const deviceToken = pgTable(
  "device_token",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    platform: devicePlatform("platform").notNull(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
    lastUsedAt: timestamptz("last_used_at"),
  },
  (t) => [
    uniqueIndex("device_token_user_platform_uidx").on(t.userId, t.platform),
    index("device_token_user_idx").on(t.userId),
  ],
);

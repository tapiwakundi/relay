CREATE TYPE "public"."attachment_purpose" AS ENUM('message', 'avatar', 'workspace_icon', 'other');--> statement-breakpoint
CREATE TYPE "public"."channel_kind" AS ENUM('public', 'private', 'dm', 'mpim');--> statement-breakpoint
CREATE TYPE "public"."device_platform" AS ENUM('ios', 'android', 'desktop', 'web');--> statement-breakpoint
CREATE TYPE "public"."invite_status" AS ENUM('pending', 'accepted', 'expired', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."presence_kind" AS ENUM('active', 'away', 'dnd', 'offline');--> statement-breakpoint
CREATE TYPE "public"."workspace_role" AS ENUM('owner', 'admin', 'member', 'guest');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"issuer" text DEFAULT '' NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attachment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"uploaded_by" text,
	"storage_key" text NOT NULL,
	"file_name" text NOT NULL,
	"content_type" text,
	"byte_size" bigint,
	"purpose" "attachment_purpose" DEFAULT 'message' NOT NULL,
	"message_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "attachment_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "attachment_size_ck" CHECK ("attachment"."byte_size" is null or "attachment"."byte_size" >= 0)
);
--> statement-breakpoint
CREATE TABLE "channel" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"kind" "channel_kind" DEFAULT 'public' NOT NULL,
	"name" text NOT NULL,
	"topic" text,
	"description" text,
	"dm_key" text,
	"mpim_key" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "channel_dm_key_ck" CHECK (("channel"."kind" = 'dm') = ("channel"."dm_key" is not null) and ("channel"."kind" = 'mpim') = ("channel"."mpim_key" is not null))
);
--> statement-breakpoint
CREATE TABLE "channel_member" (
	"channel_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"last_read_at" timestamp with time zone,
	"is_starred" boolean DEFAULT false NOT NULL,
	"is_muted" boolean DEFAULT false NOT NULL,
	"unread_count" integer DEFAULT 0 NOT NULL,
	"mention_count" integer DEFAULT 0 NOT NULL,
	"left_at" timestamp with time zone,
	CONSTRAINT "channel_member_channel_id_user_id_pk" PRIMARY KEY("channel_id","user_id"),
	CONSTRAINT "channel_member_unread_ck" CHECK ("channel_member"."unread_count" >= 0),
	CONSTRAINT "channel_member_mention_ck" CHECK ("channel_member"."mention_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "device_token" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"platform" "device_platform" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	CONSTRAINT "device_token_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "huddle" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid NOT NULL,
	"started_by" text,
	"livekit_room" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	CONSTRAINT "huddle_livekit_room_unique" UNIQUE("livekit_room")
);
--> statement-breakpoint
CREATE TABLE "huddle_participant" (
	"huddle_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"muted" boolean DEFAULT false NOT NULL,
	"camera_on" boolean DEFAULT false NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "huddle_participant_huddle_id_user_id_pk" PRIMARY KEY("huddle_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "invite" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"email" text NOT NULL,
	"invited_by" text,
	"token" text NOT NULL,
	"status" "invite_status" DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invite_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"parent_id" uuid,
	"author_user_id" text,
	"author_display_name" text NOT NULL,
	"author_avatar_key" text,
	"body" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"deleted_by" text,
	CONSTRAINT "message_not_own_parent_ck" CHECK ("message"."parent_id" is distinct from "message"."id")
);
--> statement-breakpoint
CREATE TABLE "reaction" (
	"message_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"emoji" text NOT NULL,
	CONSTRAINT "reaction_message_id_user_id_emoji_pk" PRIMARY KEY("message_id","user_id","emoji")
);
--> statement-breakpoint
CREATE TABLE "saved_item" (
	"user_id" text NOT NULL,
	"message_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_item_user_id_message_id_pk" PRIMARY KEY("user_id","message_id")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "user_preference" (
	"user_id" text PRIMARY KEY NOT NULL,
	"active_workspace_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"icon_color" text DEFAULT '#4A154B' NOT NULL,
	"icon_letter" text DEFAULT 'R' NOT NULL,
	"icon_key" text,
	"plan" text DEFAULT 'Pro' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "workspace_member" (
	"workspace_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" "workspace_role" DEFAULT 'member' NOT NULL,
	"display_name" text NOT NULL,
	"title" text,
	"status_text" text,
	"status_emoji" text,
	"presence" "presence_kind" DEFAULT 'offline' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_member_workspace_id_user_id_pk" PRIMARY KEY("workspace_id","user_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "channel_id_workspace_uidx" ON "channel" USING btree ("id","workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "message_id_channel_uidx" ON "message" USING btree ("id","channel_id");--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_message_id_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."message"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel" ADD CONSTRAINT "channel_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel" ADD CONSTRAINT "channel_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_member" ADD CONSTRAINT "channel_member_channel_id_channel_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channel"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_member" ADD CONSTRAINT "channel_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_member" ADD CONSTRAINT "channel_member_workspace_member_fk" FOREIGN KEY ("workspace_id","user_id") REFERENCES "public"."workspace_member"("workspace_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_member" ADD CONSTRAINT "channel_member_channel_workspace_fk" FOREIGN KEY ("channel_id","workspace_id") REFERENCES "public"."channel"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_token" ADD CONSTRAINT "device_token_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "huddle" ADD CONSTRAINT "huddle_channel_id_channel_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channel"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "huddle" ADD CONSTRAINT "huddle_started_by_user_id_fk" FOREIGN KEY ("started_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "huddle_participant" ADD CONSTRAINT "huddle_participant_huddle_id_huddle_id_fk" FOREIGN KEY ("huddle_id") REFERENCES "public"."huddle"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "huddle_participant" ADD CONSTRAINT "huddle_participant_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite" ADD CONSTRAINT "invite_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite" ADD CONSTRAINT "invite_invited_by_user_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite" ADD CONSTRAINT "invite_accepted_by_user_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_channel_id_channel_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channel"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_deleted_by_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_parent_same_channel_fk" FOREIGN KEY ("parent_id","channel_id") REFERENCES "public"."message"("id","channel_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_channel_workspace_fk" FOREIGN KEY ("channel_id","workspace_id") REFERENCES "public"."channel"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reaction" ADD CONSTRAINT "reaction_message_id_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reaction" ADD CONSTRAINT "reaction_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_item" ADD CONSTRAINT "saved_item_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_item" ADD CONSTRAINT "saved_item_message_id_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preference" ADD CONSTRAINT "user_preference_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preference" ADD CONSTRAINT "user_preference_active_workspace_id_workspace_id_fk" FOREIGN KEY ("active_workspace_id") REFERENCES "public"."workspace"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace" ADD CONSTRAINT "workspace_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_member" ADD CONSTRAINT "workspace_member_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_member" ADD CONSTRAINT "workspace_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "account_issuer_account_id_uidx" ON "account" USING btree ("issuer","account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "account_provider_account_uidx" ON "account" USING btree ("provider_id","account_id");--> statement-breakpoint
CREATE INDEX "attachment_workspace_created_idx" ON "attachment" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "attachment_message_idx" ON "attachment" USING btree ("message_id") WHERE "attachment"."message_id" is not null;--> statement-breakpoint
CREATE INDEX "attachment_uploader_idx" ON "attachment" USING btree ("uploaded_by") WHERE "attachment"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "channel_workspace_alive_idx" ON "channel" USING btree ("workspace_id") WHERE "channel"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "channel_workspace_kind_idx" ON "channel" USING btree ("workspace_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "channel_name_alive_uidx" ON "channel" USING btree ("workspace_id","name") WHERE "channel"."kind" in ('public', 'private') and "channel"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "channel_dm_key_uidx" ON "channel" USING btree ("workspace_id","dm_key") WHERE "channel"."kind" = 'dm' and "channel"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "channel_mpim_key_uidx" ON "channel" USING btree ("workspace_id","mpim_key") WHERE "channel"."kind" = 'mpim' and "channel"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "channel_member_user_active_idx" ON "channel_member" USING btree ("user_id","channel_id") WHERE "channel_member"."left_at" is null;--> statement-breakpoint
CREATE INDEX "channel_member_channel_active_idx" ON "channel_member" USING btree ("channel_id") WHERE "channel_member"."left_at" is null;--> statement-breakpoint
CREATE INDEX "channel_member_workspace_user_idx" ON "channel_member" USING btree ("workspace_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "device_token_user_platform_uidx" ON "device_token" USING btree ("user_id","platform");--> statement-breakpoint
CREATE INDEX "device_token_user_idx" ON "device_token" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "huddle_one_open_per_channel_uidx" ON "huddle" USING btree ("channel_id") WHERE "huddle"."ended_at" is null;--> statement-breakpoint
CREATE INDEX "huddle_channel_started_idx" ON "huddle" USING btree ("channel_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "invite_pending_email_uidx" ON "invite" USING btree ("workspace_id","email") WHERE "invite"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "invite_workspace_status_idx" ON "invite" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "invite_email_pending_idx" ON "invite" USING btree ("email") WHERE "invite"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "message_channel_created_idx" ON "message" USING btree ("channel_id","created_at") WHERE "message"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "message_channel_parent_created_idx" ON "message" USING btree ("channel_id","parent_id","created_at");--> statement-breakpoint
CREATE INDEX "message_parent_idx" ON "message" USING btree ("parent_id") WHERE "message"."parent_id" is not null;--> statement-breakpoint
CREATE INDEX "message_workspace_created_idx" ON "message" USING btree ("workspace_id","created_at") WHERE "message"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "reaction_message_idx" ON "reaction" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "saved_item_user_created_idx" ON "saved_item" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_slug_alive_uidx" ON "workspace" USING btree ("slug") WHERE "workspace"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "workspace_created_by_idx" ON "workspace" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "workspace_member_user_active_idx" ON "workspace_member" USING btree ("user_id") WHERE "workspace_member"."left_at" is null;--> statement-breakpoint
CREATE INDEX "workspace_member_workspace_active_idx" ON "workspace_member" USING btree ("workspace_id") WHERE "workspace_member"."left_at" is null;--> statement-breakpoint
CREATE INDEX "user_email_lower_idx" ON "user" USING btree (lower("email"));--> statement-breakpoint
CREATE OR REPLACE FUNCTION relay_assert_message_thread()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  p_channel uuid;
  p_parent uuid;
  p_workspace uuid;
BEGIN
  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT channel_id, parent_id, workspace_id INTO p_channel, p_parent, p_workspace
  FROM message WHERE id = NEW.parent_id;
  IF p_channel IS NULL THEN
    RAISE EXCEPTION 'parent message % not found', NEW.parent_id;
  END IF;
  IF p_channel IS DISTINCT FROM NEW.channel_id OR p_workspace IS DISTINCT FROM NEW.workspace_id THEN
    RAISE EXCEPTION 'parent channel mismatch';
  END IF;
  IF p_parent IS NOT NULL THEN
    RAISE EXCEPTION 'parent must be thread root';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER message_thread_check
  BEFORE INSERT OR UPDATE OF parent_id, channel_id, workspace_id ON message
  FOR EACH ROW EXECUTE FUNCTION relay_assert_message_thread();--> statement-breakpoint
CREATE OR REPLACE FUNCTION relay_assert_active_workspace_member()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.left_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM workspace_member wm
    WHERE wm.workspace_id = NEW.workspace_id
      AND wm.user_id = NEW.user_id
      AND wm.left_at IS NULL
  ) THEN
    RAISE EXCEPTION 'user is not an active workspace member';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER channel_member_active_ws
  BEFORE INSERT OR UPDATE ON channel_member
  FOR EACH ROW EXECUTE FUNCTION relay_assert_active_workspace_member();--> statement-breakpoint
CREATE OR REPLACE FUNCTION relay_fill_channel_member_workspace()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  SELECT workspace_id INTO NEW.workspace_id FROM channel WHERE id = NEW.channel_id;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER channel_member_fill_workspace
  BEFORE INSERT OR UPDATE OF channel_id ON channel_member
  FOR EACH ROW EXECUTE FUNCTION relay_fill_channel_member_workspace();
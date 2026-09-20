ALTER TABLE "device_token" DROP CONSTRAINT "device_token_token_unique";--> statement-breakpoint
DROP INDEX "device_token_user_platform_uidx";--> statement-breakpoint
CREATE UNIQUE INDEX "device_token_user_token_uidx" ON "device_token" USING btree ("user_id","token");--> statement-breakpoint
CREATE INDEX "device_token_token_idx" ON "device_token" USING btree ("token");

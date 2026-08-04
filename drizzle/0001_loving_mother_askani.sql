CREATE TABLE "app_users" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text,
	"username" text NOT NULL,
	"display_name" text NOT NULL,
	"role" text NOT NULL,
	"password_hash" text NOT NULL,
	"password_salt" text NOT NULL,
	"active" integer DEFAULT 1 NOT NULL,
	"must_change_password" integer DEFAULT 1 NOT NULL,
	"failed_login_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" text,
	"last_login_at" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	CONSTRAINT "app_users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"created_at" text NOT NULL,
	"expires_at" text NOT NULL,
	"last_seen_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"short_name" text NOT NULL,
	"legal_title" text NOT NULL,
	"job_firm" text NOT NULL,
	"active" integer DEFAULT 1 NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	CONSTRAINT "customer_accounts_code_unique" UNIQUE("code"),
	CONSTRAINT "customer_accounts_job_firm_unique" UNIQUE("job_firm")
);
--> statement-breakpoint
ALTER TABLE "app_users" ADD CONSTRAINT "app_users_customer_id_customer_accounts_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "app_users_customer_idx" ON "app_users" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "auth_sessions_user_idx" ON "auth_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_sessions_expiry_idx" ON "auth_sessions" USING btree ("expires_at");
CREATE TABLE "external_transport_days" (
	"id" text PRIMARY KEY NOT NULL,
	"entry_date" text NOT NULL,
	"month_key" text NOT NULL,
	"income_amount" double precision DEFAULT 0 NOT NULL,
	"income_note" text DEFAULT '' NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	CONSTRAINT "external_transport_days_entry_date_unique" UNIQUE("entry_date")
);
--> statement-breakpoint
CREATE TABLE "external_transport_expenses" (
	"id" text PRIMARY KEY NOT NULL,
	"day_id" text NOT NULL,
	"label" text NOT NULL,
	"amount" double precision NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "external_transport_expenses" ADD CONSTRAINT "external_transport_expenses_day_id_external_transport_days_id_fk" FOREIGN KEY ("day_id") REFERENCES "public"."external_transport_days"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "external_transport_days_month_idx" ON "external_transport_days" USING btree ("month_key");--> statement-breakpoint
CREATE INDEX "external_transport_expenses_day_idx" ON "external_transport_expenses" USING btree ("day_id");
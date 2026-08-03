CREATE TABLE "courier_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"job_date" text NOT NULL,
	"month_key" text NOT NULL,
	"firm" text NOT NULL,
	"customer_title" text NOT NULL,
	"tax_office" text DEFAULT '' NOT NULL,
	"tax_number" text DEFAULT '' NOT NULL,
	"customer_address" text DEFAULT '' NOT NULL,
	"contact_name" text DEFAULT '' NOT NULL,
	"contact_phone" text DEFAULT '' NOT NULL,
	"order_no" text DEFAULT '' NOT NULL,
	"departure" text NOT NULL,
	"departure_zone" text NOT NULL,
	"arrival" text NOT NULL,
	"arrival_zone" text NOT NULL,
	"vehicle" text NOT NULL,
	"priority" text NOT NULL,
	"package_profile" text NOT NULL,
	"actual_desi" double precision,
	"applied_desi" double precision NOT NULL,
	"distance_km" double precision,
	"note" text DEFAULT '' NOT NULL,
	"net_price" double precision NOT NULL,
	"vat_rate" double precision DEFAULT 0.2 NOT NULL,
	"price_date" text NOT NULL,
	"proforma_included" integer DEFAULT 0 NOT NULL,
	"proforma_added_at" text
);
--> statement-breakpoint
CREATE INDEX "courier_jobs_month_idx" ON "courier_jobs" USING btree ("month_key");--> statement-breakpoint
CREATE INDEX "courier_jobs_firm_month_idx" ON "courier_jobs" USING btree ("firm","month_key");--> statement-breakpoint
CREATE INDEX "courier_jobs_proforma_idx" ON "courier_jobs" USING btree ("proforma_included");
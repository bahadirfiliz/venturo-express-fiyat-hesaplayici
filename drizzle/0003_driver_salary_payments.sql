CREATE TABLE "external_transport_driver_payments" (
	"id" text PRIMARY KEY NOT NULL,
	"payment_date" date NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"voided_at" timestamp with time zone,
	CONSTRAINT "external_transport_driver_payments_amount_positive" CHECK ("external_transport_driver_payments"."amount" > 0)
);
--> statement-breakpoint
CREATE INDEX "external_transport_driver_payments_date_idx" ON "external_transport_driver_payments" USING btree ("payment_date");
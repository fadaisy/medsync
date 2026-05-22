CREATE TABLE "interest_signups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audience" text NOT NULL,
	"email" text NOT NULL,
	"full_name" text NOT NULL,
	"context" text,
	"hospital_name" text,
	"role" text,
	"source" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "interest_signups_audience_check" CHECK ("interest_signups"."audience" IN ('patient', 'clinical', 'hospital'))
);
--> statement-breakpoint
CREATE INDEX "interest_signups_email_idx" ON "interest_signups" USING btree ("email");--> statement-breakpoint
CREATE INDEX "interest_signups_audience_created_idx" ON "interest_signups" USING btree ("audience","created_at");
-- Purpose: the accounts module's tables (REQ-013, REQ-014, REQ-015, REQ-024, REQ-026, REQ-027): accounts with the store-enforced unique email and switched-on display name, per-year allowance changes (D-025), server-side sessions (D-003), the change history and the team settings.
CREATE TABLE `account_allowances` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`allowance` integer NOT NULL,
	`starts_year` integer NOT NULL,
	`made_at` text NOT NULL,
	`made_by` integer,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`made_by`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "account_allowances_range" CHECK("account_allowances"."allowance" BETWEEN 0 AND 260)
);
--> statement-breakpoint
CREATE INDEX `account_allowances_account` ON `account_allowances` (`account_id`);--> statement-breakpoint
CREATE TABLE `account_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`by_account_id` integer,
	`at` text NOT NULL,
	`what` text NOT NULL,
	`from_value` text,
	`to_value` text,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`by_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `account_events_account` ON `account_events` (`account_id`);--> statement-breakpoint
CREATE TABLE `accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`name_key` text NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`password_version` integer DEFAULT 1 NOT NULL,
	`must_change_password` integer DEFAULT 1 NOT NULL,
	`is_admin` integer DEFAULT 0 NOT NULL,
	`switched_on` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT "accounts_email_normalised" CHECK("accounts"."email" = lower(trim("accounts"."email")) AND length("accounts"."email") > 0),
	CONSTRAINT "accounts_name_key_present" CHECK(length("accounts"."name_key") > 0),
	CONSTRAINT "accounts_flags" CHECK("accounts"."is_admin" IN (0, 1) AND "accounts"."switched_on" IN (0, 1) AND "accounts"."must_change_password" IN (0, 1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_email_unique` ON `accounts` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_name_key_on_unique` ON `accounts` (`name_key`) WHERE "accounts"."switched_on" = 1;--> statement-breakpoint
CREATE TABLE `sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`account_id` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `sessions_account` ON `sessions` (`account_id`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);

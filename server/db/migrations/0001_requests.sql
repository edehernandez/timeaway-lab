-- Purpose: the requests module's table (REQ-001 to REQ-005, D-036): each request with its kind, its first and last day as real YYYY-MM-DD dates in one year, its counted weekdays, its state (RULE-004) and its cancel record (D-020).
CREATE TABLE `requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`kind` text NOT NULL,
	`first_day` text NOT NULL,
	`last_day` text NOT NULL,
	`counted_days` integer NOT NULL,
	`state` text NOT NULL,
	`sent_at` text NOT NULL,
	`cancelled_at` text,
	`cancelled_by` integer,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`cancelled_by`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "requests_kind" CHECK("requests"."kind" IN ('vacation', 'sick')),
	CONSTRAINT "requests_state" CHECK("requests"."state" IN ('pending', 'approved', 'rejected', 'cancelled')),
	CONSTRAINT "requests_days" CHECK(date("requests"."first_day") IS "requests"."first_day" AND date("requests"."last_day") IS "requests"."last_day" AND length("requests"."first_day") = 10 AND length("requests"."last_day") = 10 AND "requests"."first_day" <= "requests"."last_day" AND substr("requests"."first_day", 1, 4) = substr("requests"."last_day", 1, 4)),
	CONSTRAINT "requests_counted" CHECK("requests"."counted_days" >= 1)
);
--> statement-breakpoint
CREATE INDEX `requests_account` ON `requests` (`account_id`);
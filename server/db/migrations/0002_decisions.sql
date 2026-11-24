-- Purpose: the admin's decisions and cancels on a request (REQ-008, REQ-009, REQ-010, REQ-017, REQ-019, D-040): who decided it and when, the rejection note of at most 200 characters, and the Monday to Friday day a partial cancel takes effect from — a real YYYY-MM-DD day inside the request, after its first day, on an approved request only. Additive columns (D-009).
ALTER TABLE `requests` ADD `decided_at` text;
--> statement-breakpoint
ALTER TABLE `requests` ADD `decided_by` integer REFERENCES `accounts`(`id`);
--> statement-breakpoint
ALTER TABLE `requests` ADD `rejection_note` text CONSTRAINT "requests_note" CHECK("rejection_note" IS NULL OR (length("rejection_note") BETWEEN 1 AND 200));
--> statement-breakpoint
ALTER TABLE `requests` ADD `cancel_from` text CONSTRAINT "requests_cancel_from" CHECK("cancel_from" IS NULL OR (date("cancel_from") IS "cancel_from" AND length("cancel_from") = 10 AND "cancel_from" > "first_day" AND "cancel_from" <= "last_day" AND "state" = 'approved' AND strftime('%w', "cancel_from") NOT IN ('0', '6')));

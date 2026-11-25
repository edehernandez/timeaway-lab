-- Purpose: every allowance change records the year it starts and its old and new value as whole numbers of days (REQ-018 arms 2 and 4, REQ-028, D-043). Additive column (D-009); an allowance change recorded before it in the form "N days from Y" is rewritten to N and Y, its old value unknown.
ALTER TABLE `account_events` ADD `starts_year` integer;
--> statement-breakpoint
UPDATE `account_events` SET `starts_year` = CAST(substr(`to_value`, instr(`to_value`, ' days from ') + 11) AS INTEGER), `to_value` = substr(`to_value`, 1, instr(`to_value`, ' days from ') - 1) WHERE `what` = 'allowance set' AND `starts_year` IS NULL AND instr(`to_value`, ' days from ') > 0;

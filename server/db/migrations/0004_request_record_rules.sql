-- Purpose: the record rules of a stored request, held by the store itself (REQ-017, REQ-019, ROW-198, D-020, D-040): who decided it and when exactly on approved and rejected requests (and on a cancelled one that was approved first), who cancelled it and when exactly on cancelled and partly cancelled requests, a rejection note only on a rejected one, and a decider written only by the decision itself. Additive (D-009): triggers judge every row written from now on, past any route.
CREATE TRIGGER `requests_record_rules_insert` BEFORE INSERT ON `requests`
WHEN NOT (
  (NEW.`state` = 'pending' AND NEW.`decided_by` IS NULL AND NEW.`decided_at` IS NULL AND NEW.`rejection_note` IS NULL AND NEW.`cancel_from` IS NULL AND NEW.`cancelled_by` IS NULL AND NEW.`cancelled_at` IS NULL)
  OR (NEW.`state` = 'approved' AND NEW.`decided_by` IS NOT NULL AND NEW.`decided_at` IS NOT NULL AND NEW.`rejection_note` IS NULL
      AND ((NEW.`cancel_from` IS NULL AND NEW.`cancelled_by` IS NULL AND NEW.`cancelled_at` IS NULL)
        OR (NEW.`cancel_from` IS NOT NULL AND NEW.`cancelled_by` IS NOT NULL AND NEW.`cancelled_at` IS NOT NULL)))
  OR (NEW.`state` = 'rejected' AND NEW.`decided_by` IS NOT NULL AND NEW.`decided_at` IS NOT NULL AND NEW.`cancel_from` IS NULL AND NEW.`cancelled_by` IS NULL AND NEW.`cancelled_at` IS NULL)
  OR (NEW.`state` = 'cancelled' AND NEW.`cancelled_by` IS NOT NULL AND NEW.`cancelled_at` IS NOT NULL AND NEW.`cancel_from` IS NULL AND NEW.`rejection_note` IS NULL
      AND (NEW.`decided_by` IS NULL) = (NEW.`decided_at` IS NULL))
)
BEGIN
  SELECT RAISE(ABORT, 'requests: the record breaks a record rule of its state (REQ-017)');
END;
--> statement-breakpoint
CREATE TRIGGER `requests_record_rules_update` BEFORE UPDATE ON `requests`
WHEN (NOT (
  (NEW.`state` = 'pending' AND NEW.`decided_by` IS NULL AND NEW.`decided_at` IS NULL AND NEW.`rejection_note` IS NULL AND NEW.`cancel_from` IS NULL AND NEW.`cancelled_by` IS NULL AND NEW.`cancelled_at` IS NULL)
  OR (NEW.`state` = 'approved' AND NEW.`decided_by` IS NOT NULL AND NEW.`decided_at` IS NOT NULL AND NEW.`rejection_note` IS NULL
      AND ((NEW.`cancel_from` IS NULL AND NEW.`cancelled_by` IS NULL AND NEW.`cancelled_at` IS NULL)
        OR (NEW.`cancel_from` IS NOT NULL AND NEW.`cancelled_by` IS NOT NULL AND NEW.`cancelled_at` IS NOT NULL)))
  OR (NEW.`state` = 'rejected' AND NEW.`decided_by` IS NOT NULL AND NEW.`decided_at` IS NOT NULL AND NEW.`cancel_from` IS NULL AND NEW.`cancelled_by` IS NULL AND NEW.`cancelled_at` IS NULL)
  OR (NEW.`state` = 'cancelled' AND NEW.`cancelled_by` IS NOT NULL AND NEW.`cancelled_at` IS NOT NULL AND NEW.`cancel_from` IS NULL AND NEW.`rejection_note` IS NULL
      AND (NEW.`decided_by` IS NULL) = (NEW.`decided_at` IS NULL))
))
OR ((NEW.`decided_by` IS NOT OLD.`decided_by` OR NEW.`decided_at` IS NOT OLD.`decided_at`)
    AND NOT (OLD.`state` = 'pending' AND NEW.`state` IN ('approved', 'rejected')))
BEGIN
  SELECT RAISE(ABORT, 'requests: the record breaks a record rule of its state (REQ-017)');
END;

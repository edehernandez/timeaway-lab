# TimeAway

A small web app for one team of up to 30 people to request, decide and see
whole working days off, as vacation or sick. One admin approves or rejects
requests, sets each person's yearly vacation allowance and runs the accounts.
Each person sees their own requests and days left; everyone sees a month
calendar of who is away, never why. No email, no sign-up.

The spec is PRD.md; the stack is in BASELINE.md. How to run it, how to test it
(`sh checks/test.sh`) and the preview command arrive with the code skeleton —
there is no code yet.

## Before you put this online

Not a framework. A sticky note. With /vid deploy, items 1, 2, 4 and 5 are
enforced structurally — the rest still matter.

1. Restore one backup before you trust backups — actually run the restore, once, end to end.
2. Redirect a week of outbound email to your own inbox first; read what the product sends.
3. Try one real feed/integration end-to-end before switching them all on.
4. Rotate any secret an agent ever saw — every key that was ever pasted into a session.
5. Agents never hold prod credentials. Deploys happen from your hands, not from a session.
6. Put a spending cap on every paid API and on the hosting account.
7. Check each Tier-0 row in BASELINE.md by hand once, in the real environment.
8. Keep a copy of PRD.md and DECISIONS.md somewhere off the server.
9. First week: read the logs daily. Boring logs are the goal.
10. When something is wrong, run /vid:vid-fix and answer its questions — don't patch by hand.

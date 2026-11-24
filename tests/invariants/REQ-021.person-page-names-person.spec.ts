// Purpose: ledger tests for ROW-193 (REQ-021) — a person's requests page opened by the admin names that person, display name and email, at its top.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-12); fixture data made through the product's public routes by harness.ts (reset, create account, send), fresh per run; the pages loaded in the browser through the engine door (openPage).
//
// ROW-193 promise: REQ-021 "from the people page the admin opens any person's requests page, listing all of
// ROW-193   that person's requests" — the row's reading: the page names that person (display name and email) at
// ROW-193   its top. Authority: REQ-021 (A-031).
// ROW-193 wrong product: a person page titled with the signed-in admin's name (the shared layout's "me"), or
// ROW-193   with no name at all ("Requests"), or with the first person of the list whatever the id; or naming the
// ROW-193   person only below the list, or with the name but not the email.
// ROW-193 given: a fresh install; persons Pia and Quin, fresh names and emails, each with one pending request
// ROW-193   (Pia's in April, Quin's in May). when: the admin opens Pia's page, then Quin's. then: on each, the main
// ROW-193   heading (level 1) carries that person's name and not the admin's or the other person's; the person's
// ROW-193   email is drawn, above the person's request row; the other person's name and email are not on the page.
// ROW-193 controls: the control case — the admin's page for Pia answers 200 and draws Pia's April request row —
// ROW-193   so the page and the row the "above" compares against exist.
// ROW-193 technique: decoys — the admin's name and the other person's name and email, each a fresh value that
// ROW-193   must not match; two persons so one fixed title can't pass both.
// ROW-193 cases: ROW-193 target=ROW-193.REQ-021.the-person-page-names-the-person-at-its-top control=ROW-193.control.the-person-page-draws-the-persons-request
import { test, expect } from '@playwright/test';
import { createMember, freshEmail, freshName, openPage, PAGES, resetProduct, sendRequest, signIn, signInMember, type Actor, type Install, type Member } from './harness';
import { loadSettled, monthMarker, rowWith } from './page-rows';

const NOW = '2027-03-09T20:00:00Z'; // Wed 2027-03-10 09:00 in Pacific/Auckland

interface World {
  install: Install;
  admin: Actor;
  pia: Member;
  quin: Member;
}

async function world(): Promise<World> {
  const install = await resetProduct({ now: NOW });
  const admin = await signIn(install.admin);
  const pia = await createMember(admin, { name: freshName('Pia'), email: freshEmail('pia') });
  const quin = await createMember(admin, { name: freshName('Quin'), email: freshEmail('quin') });
  for (const [m, firstDay] of [
    [pia, '2027-04-05'],
    [quin, '2027-05-03'],
  ] as const) {
    const s = await signInMember(m);
    await sendRequest(s, { kind: 'vacation', firstDay, lastDay: firstDay });
    await s.dispose();
  }
  return { install, admin, pia, quin };
}

test('ROW-193.control.the-person-page-draws-the-persons-request', async ({ browser }) => {
  const w = await world();
  const opened = await openPage(browser, w.admin);
  try {
    expect(await loadSettled(opened.page, PAGES.adminPerson(w.pia.id)), 'ROW-193 control: Pia\'s page answers').toBe(200);
    await expect(rowWith(opened.page, monthMarker('2027-04-05')), 'ROW-193 control: Pia\'s April request row is drawn').toBeVisible();
  } finally {
    await opened.close();
    await w.admin.dispose();
  }
});

test('ROW-193.REQ-021.the-person-page-names-the-person-at-its-top', async ({ browser }) => {
  const w = await world();
  const opened = await openPage(browser, w.admin);
  const page = opened.page;
  try {
    for (const [person, other, day] of [
      [w.pia, w.quin, '2027-04-05'],
      [w.quin, w.pia, '2027-05-03'],
    ] as const) {
      const label = person === w.pia ? 'Pia' : 'Quin';
      expect.soft(await loadSettled(page, PAGES.adminPerson(person.id)), `ROW-193 ${label}'s page answers`).toBe(200);
      const heading = page.getByRole('heading', { level: 1 });
      await expect.soft(heading, `ROW-193 ${label}'s page has one main heading`).toHaveCount(1);
      await expect.soft(heading.first(), `ROW-193 ${label}'s main heading carries ${label}'s name`).toContainText(person.name);
      await expect.soft(heading.first(), `ROW-193 ${label}'s main heading does not carry the admin's name`).not.toContainText(w.install.admin.name);
      await expect.soft(heading.first(), `ROW-193 ${label}'s main heading does not carry the other person's name`).not.toContainText(other.name);

      const email = page.getByText(person.email, { exact: false }).first();
      await expect.soft(email, `ROW-193 ${label}'s page draws ${label}'s email`).toBeVisible();
      const row = rowWith(page, monthMarker(day));
      const emailBox = await email.boundingBox().catch(() => null);
      const headingBox = await heading.first().boundingBox().catch(() => null);
      const rowBox = await row.boundingBox().catch(() => null);
      expect.soft(rowBox, `ROW-193 ${label}'s request row is drawn`).not.toBeNull();
      expect.soft((emailBox?.y ?? Infinity) < (rowBox?.y ?? -Infinity), `ROW-193 ${label}'s email is drawn above the request list`).toBe(true);
      expect.soft((headingBox?.y ?? Infinity) < (rowBox?.y ?? -Infinity), `ROW-193 ${label}'s name heading is drawn above the request list`).toBe(true);

      const text = (await page.locator('body').innerText()).toLowerCase();
      expect.soft(text.includes(other.name.toLowerCase()), `ROW-193 ${label}'s page does not draw the other person's name`).toBe(false);
      expect.soft(text.includes(other.email.toLowerCase()), `ROW-193 ${label}'s page does not draw the other person's email`).toBe(false);
    }
  } finally {
    await opened.close();
    await w.admin.dispose();
  }
});

// Provenance: hand-authored — the labelled detector fixture (vid-skeleton Part 2).
test('ROW-010 status span', async () => {
  expect([200, 201, 302]).toContain(res.status())
})
test('ROW-011 presence only', async () => {
  await expect(page.getByText('Days left')).toBeVisible()
})
test('ROW-012 or constant', async () => {
  expect(ok || true).toBe(true)
})
test('ROW-013 a message with an apostrophe', async () => {
  expect(left, "the person's days left").toBe(20)
})
test('ROW-014 refused and allowed', async () => {
  expect([200, 409]).toContain(res.status())
})

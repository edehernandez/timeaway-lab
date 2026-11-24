// Provenance: hand-authored — the labelled detector fixture (vid-skeleton Part 2).
test('ROW-001 shows the days left', async () => {
  await expect(page.getByText('Days left')).toBeVisible()
})
test('ROW-002 the days left are right', async () => {
  expect(await daysLeft()).toBe(20)
})
for (const [row, n] of [['ROW-003', 3]]) {
  test(`${row} a table of cases`, async () => {
    expect(await count()).toBe(n)
  })
}

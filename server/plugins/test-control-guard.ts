// Purpose: DIF-001 and DIF-002's production half — a start with the test control door's switch
// (TIMEAWAY_TEST_CONTROL) set outside the test profile (VID_TEST unset) refuses to start, so the clock override and
// the reset can never be reached in production.
export default defineNitroPlugin(() => {
  if (process.env.TIMEAWAY_TEST_CONTROL && process.env.VID_TEST !== '1') {
    console.error('TimeAway refuses to start: TIMEAWAY_TEST_CONTROL is set outside the test profile (VID_TEST is not 1).')
    process.exit(1)
  }
})

// Merges a computed "viewer" row into a top-11 leaderboard result: if the
// viewer already appears in the top 11, rows are returned as-is (with
// isSelf flagged); otherwise the viewer's real row replaces the 11th slot.
export function mergeViewerRow(top11Rows, viewerRow, userId) {
  let rows = top11Rows.map(r => ({ ...r, isSelf: userId != null && r.userId === userId }))
  const alreadyIncluded = userId != null && rows.some(r => r.userId === userId)
  if (userId != null && viewerRow && !alreadyIncluded) {
    rows = rows.slice(0, 10)
    rows.push({ ...viewerRow, isSelf: true })
  }
  return rows.map(({ userId: _drop, ...rest }) => rest)
}

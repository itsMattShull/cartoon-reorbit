// server/utils/uiClickSoundPath.js
//
// GlobalGameConfig.uiClickSoundPath is always written by
// server/api/admin/global-config/ui-click-sound.post.js, which only ever writes a
// server-generated relative path — never client input. But that field is read by
// server/api/global-config.get.js, a public endpoint hit on every page load by every
// visitor, and its value ends up as an <audio> src in every browser on the site. Re-validating
// the shape here before returning it is cheap insurance against a future edit that lets an
// arbitrary string reach the column (a raw text field added to the admin form, a bad migration,
// a hand-run UPDATE) — not a claim that the field is attacker-controlled today.
const PATTERN = /^\/(images\/)?ui-sounds\/[A-Za-z0-9._-]+\.(mp3|ogg|wav)$/

export function isValidUiClickSoundPath(path) {
  return typeof path === 'string' && PATTERN.test(path)
}

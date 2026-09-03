// server/utils/profanityFilter.js
// Server-side chat profanity filter. Replaces each matched bad word with
// "grilled cheese" — deliberately whole-word replacement, not blanking the
// message, so the filter is visible/funny rather than silently censoring.
//
// Must run server-side only (server/socket-server.js's chat:send, before the
// message is persisted): a client-side-only filter is trivially bypassed by
// anyone who edits the request, and the point is to stop the word from ever
// reaching the database, not just from being displayed by the official client.

const REPLACEMENT = 'grilled cheese'

// Deliberately common/unambiguous words only. Word-boundary matching already
// protects short substrings like "ass" from firing inside "class"/"assist";
// keeping the list to unambiguous terms avoids false positives on real words
// (e.g. no "hell"/"damn" — too many legitimate uses: "what the hell", place
// names, mild exclamations) while still catching what a "curse word filter"
// is actually asked to catch.
const BASE_WORDS = [
  'fuck', 'shit', 'bitch', 'asshole', 'bastard', 'cunt', 'dick', 'piss',
  'cock', 'pussy', 'whore', 'slut', 'faggot', 'nigger', 'nigga', 'retard'
]

// Leetspeak/punctuation substitution map used only to DETECT a match; the
// original substring (whatever the user actually typed) is what gets
// replaced, so "sh1t" and "shit" both become "grilled cheese" verbatim.
const LEET_MAP = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's' }

function normalize(token) {
  let out = ''
  for (const ch of token.toLowerCase()) {
    out += LEET_MAP[ch] ?? ch
  }
  // Collapse runs of the same letter ("fuuuuck", "shiiiit") so repeated
  // characters used to dodge a literal match still normalize to the base word.
  return out.replace(/(.)\1+/g, '$1')
}

const WORD_SET = new Set(BASE_WORDS.map(normalize))

// Matches a run of letters/digits/leet-punctuation — the unit we test against
// WORD_SET, one candidate at a time, so surrounding punctuation/spacing in the
// original text is preserved untouched.
const TOKEN_RE = /[A-Za-z0-9@$]+/g

export function filterProfanity(text) {
  if (typeof text !== 'string' || !text) return text
  return text.replace(TOKEN_RE, (token) => (WORD_SET.has(normalize(token)) ? REPLACEMENT : token))
}

export function containsProfanity(text) {
  if (typeof text !== 'string' || !text) return false
  TOKEN_RE.lastIndex = 0
  let m
  while ((m = TOKEN_RE.exec(text))) {
    if (WORD_SET.has(normalize(m[0]))) return true
  }
  return false
}

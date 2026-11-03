// utils/ogGtoonLabels.js — display labels shared by the Original gToons UI.
export const OG_GROUP_LABELS = {
  BEAN_SCOUTS: 'Bean Scouts', DAILY_PLANET: 'Daily Planet', GLOBAL: 'G.L.O.B.A.L.',
  IMAGINARY_FRIEND: 'Imaginary Friend', INJUSTICE_GANG: 'Injustice Gang', JUSTICE_FRIENDS: 'Justice Friends',
  JUSTICE_LEAGUE: 'Justice League', MUCHA_LUCHA: 'Mucha Lucha', MYSTERY_INC: 'Mystery, Inc.',
  POWERPUFF_GIRLS: 'Powerpuff Girls', SQUIRREL_SCOUTS: 'Squirrel Scouts', TEEN_TITANS: 'Teen Titans',
  TIME_SQUAD: 'Time Squad', WOOHP: 'WOOHP'
}
// One small glyph per card type, for the pre-match goal cards.
export const OG_TYPE_GLYPHS = {
  FEMALE: '♀', MALE: '♂', HERO: '★', VILLAIN: '☠', ANIMAL: '🐾', MONSTER: '👾', PLACE: '⌂', PROP: '◆', VEHICLE: '🚗'
}
export const ogTitleCase = (s) => (s ? s.charAt(0) + s.slice(1).toLowerCase() : s)

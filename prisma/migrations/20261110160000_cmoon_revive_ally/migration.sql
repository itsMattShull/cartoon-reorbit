-- Adds the REVIVE_ALLY special-attack effect type (revives a knocked-out teammate in a raid or
-- PvP match; inert in a solo battle, same "no case for it" mechanism as POISON_OPPONENT/
-- CLEANSE_SELF/SHIELD_PARTY). No new columns -- amount/accuracyPercent/healsAllies are all
-- reused generically, see CMoonSpecialAttackEffectType's own schema comment.
ALTER TYPE "CMoonSpecialAttackEffectType" ADD VALUE 'REVIVE_ALLY';

// server/utils/siteTheme.js
// Default values mirror the hardcoded CSS vars in layouts/newsite-template.vue's own :root
// block exactly — this is what "default theme" means, and what a brand-new SiteTheme's admin
// form starts from so an admin edits forward from the current look rather than a blank page.
export const DEFAULT_SITE_THEME = {
  orbitDarkBlue: '#336699',
  orbitLightBlue: '#3399CC',
  orbitGreen: '#66CC00',
  bgColor: '#003466',
  textColor: '#ffffff',
}

// Resolves the theme that should actually render for every visitor right now: the hardcoded
// defaults whenever GlobalGameConfig.useDefaultSiteTheme is on (the common case) — or there's no
// active theme id, or the active theme row has since been deleted — else the active SiteTheme's
// own hex values. Never throws and never returns a partial object, so every caller (the public
// global-config endpoint, the admin page's own "what's live right now" display) can use the
// result directly with no further fallback logic of its own.
export async function resolveEffectiveSiteTheme(db, cfg) {
  if (cfg?.useDefaultSiteTheme === false && cfg?.activeSiteThemeId) {
    const theme = await db.siteTheme.findUnique({ where: { id: cfg.activeSiteThemeId } })
    if (theme) {
      return {
        orbitDarkBlue: theme.orbitDarkBlue,
        orbitLightBlue: theme.orbitLightBlue,
        orbitGreen: theme.orbitGreen,
        bgColor: theme.bgColor,
        textColor: theme.textColor,
      }
    }
  }
  return { ...DEFAULT_SITE_THEME }
}

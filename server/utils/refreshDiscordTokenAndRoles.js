export async function refreshDiscordTokenAndRoles(prisma, user, config) {
    const now = Date.now()

    if (!user.discordId) {
      return
    }
  
    // Skip if token still valid
    if (user.tokenExpiresAt && user.tokenExpiresAt.getTime() > now - 60_000) return
  
    // 1. Refresh access token
    const tokenRes = await $fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      body: new URLSearchParams({
        client_id: config.discord.clientId,
        client_secret: config.discord.clientSecret,
        grant_type: 'refresh_token',
        refresh_token: user.refreshToken
      }),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    })
  
    const { access_token, refresh_token, expires_in } = tokenRes
  
    // 2. Update token in DB
    await prisma.user.update({
      where: { id: user.id },
      data: {
        accessToken: access_token,
        refreshToken: refresh_token || user.refreshToken,
        tokenExpiresAt: new Date(now + expires_in * 1000)
      }
    })
  
    // 3. Sync Discord roles and determine guild membership
    let inGuildFlag = true
    let memberData
    try {
      memberData = await $fetch(
        `https://discord.com/api/guilds/${config.discord.guildId}/members/${user.discordId}`,
        {
          headers: { Authorization: config.botToken }
        }
      )
    } catch (err) {
      console.error('Discord guild membership fetch failed:', err)
      memberData = { roles: [] }
      inGuildFlag = false
    }
    const roleIds = memberData.roles || []
    await prisma.user.update({
      where: { id: user.id },
      data: {
        roles: roleIds,
        inGuild: inGuildFlag
      }
    })
  }
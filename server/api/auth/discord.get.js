export default defineEventHandler((event) => {
    const config = useRuntimeConfig(event).discord
  
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: 'code',
      scope: 'identify email guilds guilds.members.read'
    })
  
    const discordAuthUrl = `https://discord.com/api/oauth2/authorize?${params.toString()}`
  
    return sendRedirect(event, discordAuthUrl, 302)
  })
  
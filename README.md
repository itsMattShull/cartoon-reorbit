## Cartoon ReOrbit
This is the codebase for [https://www.cartoonreorbit.com](https://www.cartoonreorbit.com).  It's a clone of Cartoon Orbit, a Cartoon Network game/community from the early 2000s. 

### Instructions for running locally
Install VSCode
Install Postgress
    note the admin username and password you created
    note the database name you created (we recommend "orbitdb")
Install NVM
Using NVM, install NodeJS 23.10.0
Fork Repo
Copy /.env.template to /.env
Update database url to include username and password and database name in the URL
Update JWT Secrete if you wish


Discord Bot for Discord Integration:
Create new discord Server
Server Settings > Roles > Create Role > Role Name: member
Set member roles to view channels, create invite, send messages, messages in threads, create public threads, Reactions, Read Message Hsitory, Connect, Speak, Video

In discord Settings, navigate to Advanced and enable Developer Mode
Right click on new discrod server > copy server ID. 
Copy Server ID to .env DISCORD_GUILD_ID

Right click server > invite People > Edit invite link to never expire > Copy link to .env DISCORD_INVITE 

Create Discord Application
https://discord.com/developers/applications
Create new application: Name it and select create

Note Application ID and place in .env file DISCORD_CLIENT_ID
navigate to OAuth2 and under Client information, reset secret under client secret. Copy secret to .env DISCORD_CLIENT_SECRET

Under OAUTH2 > Redirects click "add redirect"
Enter http://localhost:3000/api/auth/discord/callback into the redirect
Enter the same redirect uri to .env DISCORD_REDIRECT_URI
Hit Save

Under OAUTH2 URL Generator select:
identify
guilds
email
bot

Select Redirect URL you created earlier

Under bot permisions select:
Administrator

Copy URL and save for later. Dont go there yet.


Got to Bot tab
Reset token
copy value and paste into .env BOT_TOKEN
Prepend with "Bot" and surround Bot+Token with ""
Discord Developer Portal
Discord for Developers
Build games, experiences, and integrations for millions of users on Discord.
Discord for Developers
create sentri.io account:
Go to https://sentry.io/
Click get started and create an account
install sentry and follow on screen install directions from sentry
select Nuxt
on the next screen hit skip onboarding

One the main sentry dashboard, in the search bar at top right > Search for DSN
Select Client Keys and copy the DSN
Past DSN into .env SENTRY_DSN

IN TERMINAL
- install redis on your local machine and make sure it's running 
- run `npm install bullmq ioredis`
- Go into .env and fill in the following:
```
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=           # if you set one in your redis.conf
```
- 

IN VSCODE
open new terminal
run `npm install`
run `npx prisma migrate dev`
run `npx prisma generate`
run `node .\prisma\drops\addFirstDrop.js`
run `npm run dev`
open a 2nd terminal in vs code
run `node server/socket-server.js`
open a 3rd terminal in vs code
run `node server/workers/mint.worker.js`

In a browser, navigate to the discord bot link svaed earlier
Add to server: Your new discrod server
Continue > Authorize > Wait very long time
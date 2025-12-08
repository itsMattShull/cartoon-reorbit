## Cartoon ReOrbit
This is the codebase for [https://www.cartoonreorbit.com](https://www.cartoonreorbit.com). It’s a clone of Cartoon Orbit, a Cartoon Network game/community from the early 2000s.

### Instructions for running locally

#### 1) Install the Basics
- Download: https://code.visualstudio.com
- Install git on your computer

---

#### 2) Install PostgreSQL
- Install PostgreSQL (any 14+ version is fine for local dev).
  - macOS: via Postgres.app or `brew install postgresql`.
  - Linux (Debian/Ubuntu): `sudo apt-get install postgresql`.
  - Windows: use the official installer: https://www.postgresql.org/download/windows/
- Note your admin username and password.
- Create a database (recommended name: `orbitdb`).
  - Example via psql:
    - macOS/Linux:
      ```bash
      createdb orbitdb
      # or
      psql -U postgres -c "CREATE DATABASE orbitdb;"
      ```
    - Windows (Powershell):
      - Restart Powershell
      - Add psql path to environment variables: 
        - Settings
        - Edit the system environment variables
        - Environment Variables
        - Edit existing path variable
        - Click New
        - Paste in directory PostgreSQL is installed in
      - Then run these commands:
        ```powershell
        psql -U postgres -c "CREATE DATABASE orbitdb;"
        ```

---

#### 3) Install NVM (Node Version Manager)
- macOS/Linux (nvm-sh):
  ```bash
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
  # then restart your terminal
  ```
- Windows (PowerShell):
  ```powershell
  winget install CoreyButler.NVMforWindows
  # Close and reopen PowerShell after install
  ```
  If `winget` isn’t available, download the installer from:
  https://github.com/coreybutler/nvm-windows/releases

---

#### 4) Using NVM, install Node.js 23.10.0
- macOS/Linux:
  ```bash
  nvm install 23.10.0
  nvm use 23.10.0
  node -v
  ```
- Windows (PowerShell):
  - First use `nvm root` to get the path
  - Add nvm path to environment variables: 
    - Settings
    - Edit the system environment variables
    - Environment Variables
    - Edit existing path variable
    - Click New
    - Paste in directory NVM is installed in
  - Then run these commands:
    ```powershell
    nvm install 23.10.0
    nvm use 23.10.0
    node -v
    ```

---

#### 5) Fork the repo
- Fork this repository to your GitHub account, then clone your fork:
  ```bash
  git clone https://github.com/<your-github-username>/cartoon-reorbit.git
  cd cartoon-reorbit
  ```
  use `touch text.txt`, then do `git add .` and `git commit -m 'test file'` and `git push origin master` to see if the changes to your repo stick in Github.

---

#### 6) Copy env file and configure secrets
- Copy `.env.template` to `.env`:
  - macOS/Linux:
    ```bash
    cp .env.template .env
    ```
  - Windows (PowerShell):
    ```powershell
    Copy-Item .env.template -Destination .env
    ```
- Update the database URL with your username, password, and database name:
  ```env
  DATABASE_URL="postgresql://<user>:<password>@localhost:5432/orbitdb"
  ```
- Update `JWT_SECRET` (any secure random string is fine for local dev).

---

#### 7) Discord Bot for Discord Integration
- Create a new Discord Server.
- Server Settings → Roles → Create Role → Name it: `member`.
- Give `member` the following permissions: View Channels, Create Invite, Send Messages, Send Messages in Threads, Create Public Threads, Reactions, Read Message History, Connect, Speak, Video.

- Discord User Settings → Advanced → enable Developer Mode.
- Right‑click your new Discord server → Copy Server ID → set in `.env`:
  ```env
  DISCORD_GUILD_ID=<your-server-id>
  ```
- Right‑click server → Invite People → Edit invite link to never expire → copy the link → set in `.env`:
  ```env
  DISCORD_INVITE=https://discord.gg/your-invite
  ```

- Create a Discord Application: https://discord.com/developers/applications → New Application.
  - Note the Application ID → set in `.env` as:
    ```env
    DISCORD_CLIENT_ID=<your-application-id>
    ```
  - OAuth2 → Client Information → Reset Secret → copy it → set in `.env`:
    ```env
    DISCORD_CLIENT_SECRET=<your-client-secret>
    ```
  - OAuth2 → Redirects → Add redirect:
    - `http://localhost:3000/api/auth/discord/callback`
    - Set the same in `.env`:
      ```env
      DISCORD_REDIRECT_URI=http://localhost:3000/api/auth/discord/callback
      ```
  - OAuth2 → URL Generator → Scopes: `identify`, `guilds`, `email`, `bot`.
  - Select the redirect URL you created above.
  - Bot Permissions: choose `Administrator` (simplest for local dev).
  - Copy the generated URL and save it for later – don’t visit it yet.

- Bot tab → Reset Token → copy and set in `.env`:
  ```env
  BOT_TOKEN="Bot <paste-token-here>"
  ```
  Keep the `Bot ` prefix and surrounding quotes.

Optional (only if your features need interactions): set these as well
```env
DISCORD_APP_ID=<same-as-application-id>
DISCORD_PUBLIC_KEY=<from/Discord/General-Information>
```

---

#### 8) Create a Sentry account (optional but recommended)
- Go to https://sentry.io → Get Started → create an account.
- Choose Nuxt during setup, then Skip onboarding.
- In Sentry, go to Settings > Account Details, and in the top right search for “DSN” → Client Keys → copy the DSN.
- Paste into `.env`:
  ```env
  SENTRY_DSN=<your-sentry-dsn>
  ```

---

#### 9) Redis and queue setup
- Install and run Redis locally.
  - macOS: `brew install redis && brew services start redis`
  - Linux (Debian/Ubuntu): `sudo apt-get install redis-server && sudo service redis-server start`
  - Windows (PowerShell): recommended options
    - Use WSL2 (Ubuntu) and install Redis inside WSL: `sudo apt-get install redis-server`
    - or run via Docker Desktop, after starting Docker: `docker run -d --name redis -p 6379:6379 redis`
- These packages are already in `package.json`, so a separate install isn’t required:
  - `bullmq`, `ioredis`
- Ensure these values exist in `.env` (defaults shown):
  ```env
  REDIS_HOST=127.0.0.1
  REDIS_PORT=6379
  REDIS_PASSWORD=           # set only if you configured one
  MINT_QUEUE_KEY=mintQueue
  ```

---

#### 10) Install dependencies and initialize the database
- If using Windows, first open Powershell (run as admin) and type in `Set-ExecutionPolicy RemoteSigned`
- Now open VS Code, open a terminal in the project root, then run:
  ```bash
  npm install
  npx prisma migrate dev
  npx prisma generate
  ```
- Seed the first drop:
  - macOS/Linux:
    ```bash
    node ./prisma/seed.js
    ```
  - Windows (PowerShell):
    ```powershell
    node .\prisma\seed.js
    ```
---

#### 11) Run the app
- Start the dev processes:
  ```bash
  npm run dev
  ```
  This starts the Nuxt dev server, the mint worker, and the guild checker.

- Open a second terminal and start the socket server:
  ```bash
  npm run socket
  # or
  node server/socket-server.js
  ```

- If you are NOT using `npm run dev`, start the worker manually in a third terminal:
  ```bash
  npm run worker
  # or
  node server/workers/mint.worker.js
  ```

---

#### 12) Add the bot to your server
- In your browser, open the Discord OAuth2 URL you saved earlier.
- Add to Server → choose your server → Continue → Authorize. This can take a while on first run.

---

#### 13) Create account and admin yourself
- Go to http://localhost:3000
- Sign in with your discord account
- Give yourself admin role and some points:
  - macOS/Linux:
    ```bash
    node ./prisma/makeUsersAdmins.js
    ```
  - Windows (PowerShell):
    ```powershell
    node .\prisma\makeUsersAdmins.js
    ```
- Set OFFICIAL_USERNAME in `.env` to be your username, this is so features like Auction insta-bidding and Auction Only cToons work.


### Quick troubleshooting
- If Prisma cannot connect, verify `DATABASE_URL` and that PostgreSQL is running.
- If Redis jobs don’t process, confirm Redis is running and `REDIS_HOST/PORT` are correct.
- On Windows, run PowerShell as Administrator when installing `nvm-windows` and ensure you reopen the shell after install.


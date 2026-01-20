// scheduler-resize-do.js
// Schedules:
// - Mon 20:00 upsize
// - Tue 00:00 downsize
// - Tue 08:00 upsize
// - Tue 12:00 downsize
//
// Env: DO_ACCESS_TOKEN, DROPLET_ID, UPSIZE_SLUG, DOWNSIZE_SLUG,
//      BOT_TOKEN (Discord Bot token), DISCORD_USER_ID (target user),
//      TZ (e.g., America/New_York)
require('dotenv').config();
const cron = require('node-cron');

const {
  DO_ACCESS_TOKEN: DO_TOKEN,
  DROPLET_ID,
  UPSIZE_SLUG,
  DOWNSIZE_SLUG,
  BOT_TOKEN,
  DISCORD_USER_ID = '732319322093125695',
  TZ = 'America/New_York'
} = process.env;

if (!DO_TOKEN || !DROPLET_ID || !UPSIZE_SLUG || !DOWNSIZE_SLUG) {
  console.error('Missing required env: DO_ACCESS_TOKEN, DROPLET_ID, UPSIZE_SLUG, DOWNSIZE_SLUG');
  process.exit(1);
}

const BASE = 'https://api.digitalocean.com/v2';

// ---------- helpers ----------
async function api(path, method = 'GET', body) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${DO_TOKEN}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}: ${await r.text()}`);
  return r.json();
}

async function waitAction(actionId, label = 'action') {
  for (;;) {
    const { action } = await api(`/actions/${actionId}`);
    if (action.status === 'completed') return;
    if (action.status === 'errored') throw new Error(`${label} ${actionId} errored`);
    await new Promise(r => setTimeout(r, 4000));
  }
}

async function ensureOff(id) {
  const { droplet } = await api(`/droplets/${id}`);
  if (droplet.status === 'off') return;
  try {
    const { action } = await api(`/droplets/${id}/actions`, 'POST', { type: 'shutdown' });
    await waitAction(action.id, 'shutdown');
  } catch {}
  const { droplet: d2 } = await api(`/droplets/${id}`);
  if (d2.status !== 'off') {
    const { action } = await api(`/droplets/${id}/actions`, 'POST', { type: 'power_off' });
    await waitAction(action.id, 'power_off');
  }
}

async function powerOn(id) {
  const { action } = await api(`/droplets/${id}/actions`, 'POST', { type: 'power_on' });
  await waitAction(action.id, 'power_on');
}

async function resizeCpuRamOnly(id, sizeSlug) {
  try {
    await ensureOff(id);
    const { action } = await api(`/droplets/${id}/actions`, 'POST', { type: 'resize', size: sizeSlug });
    await waitAction(action.id, 'resize');
    await powerOn(id);
    return sizeSlug; // for success reporting
  } catch (err) {
    // console.log(`[DO resize scheduler] Resize to ${sizeSlug} failed: ${err?.message || err}`);
  }
}

// ---------- notifications ----------
async function notifyDiscord(userId, content) {
  if (!BOT_TOKEN) return;
  try {
    const channel = await fetch('https://discord.com/api/v10/users/@me/channels', {
      method: 'POST',
      headers: { 'Authorization': `${BOT_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient_id: userId })
    }).then(r => r.json());

    await fetch(`https://discord.com/api/v10/channels/${channel.id}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `${BOT_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content })
    });
  } catch(e) {
    // console.log(`[DO resize scheduler] Failed to notify Discord user ${userId}: ${e?.message || e}`);
  }
}

async function onError(label, err) {
  const msg = `[DO resize scheduler] ${label} failed: ${err?.message || err}`;
  console.error(msg);
  await notifyDiscord(DISCORD_USER_ID, `⚠️ ${msg}`);
}

// ---------- jobs ----------
function schedule(label, cronExpr, job) {
  cron.schedule(cronExpr, async () => {
    const start = new Date().toISOString();
    try {
      const size = await job();
      const done = new Date().toISOString();
      const ok = `[DO resize scheduler] ${label} completed at ${done}. Droplet ${DROPLET_ID} now on ${size}.`;
      await notifyDiscord(DISCORD_USER_ID, `✅ ${ok}`);
    } catch (err) {
      await onError(label, err);
    }
  }, { timezone: TZ });
}

// Mon 20:00 upsize
schedule('Mon 20:00 upsize', '20 20 * * 1', () => resizeCpuRamOnly(DROPLET_ID, UPSIZE_SLUG));
// Tue 00:00 downsize
schedule('Tue 00:00 downsize', '0 0 * * 2', () => resizeCpuRamOnly(DROPLET_ID, DOWNSIZE_SLUG));
// Tue 08:00 upsize
schedule('Tue 08:00 upsize', '0 8 * * 4', () => resizeCpuRamOnly(DROPLET_ID, UPSIZE_SLUG));
// Tue 12:00 downsize
schedule('Tue 12:00 downsize', '0 12 * * 4', () => resizeCpuRamOnly(DROPLET_ID, DOWNSIZE_SLUG));
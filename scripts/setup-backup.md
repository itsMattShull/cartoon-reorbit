# Database Backup Setup — PostgreSQL → Google Drive

Lightweight, low-resource setup: one bash script, one system cron job.  
Zero extra Node.js processes. Zero disk usage (pipes directly to Google Drive via rclone).

---

## How it works

```
pg_dump → gzip → rclone rcat → Google Drive folder
```

`rclone rcat` reads from stdin and streams directly to Google Drive — nothing  
is written to the server's disk. The backup folder in Drive shows up in your  
normal Google Drive just like any other file.

---

## 1. Create a Google Service Account (best for servers — no browser needed)

A **Service Account** authenticates automatically without OAuth popups.

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or use an existing one), e.g. `cartoon-reorbit`
3. Enable the **Google Drive API**:  
   APIs & Services → Enable APIs → search "Google Drive API" → Enable
4. Create a Service Account:  
   APIs & Services → Credentials → Create Credentials → Service Account  
   - Name: `cartoon-reorbit-backup`
   - Role: leave blank (Drive access is granted via folder sharing, not IAM)
5. Open the service account → Keys tab → Add Key → JSON  
   Download the JSON key file — you'll copy its contents to the server.

---

## 2. Create a Google Drive backup folder and share it

1. In your personal Google Drive, create a folder called `cartoon-reorbit-backups`
2. Right-click the folder → Share
3. Paste the **service account email** (looks like `cartoon-reorbit-backup@your-project.iam.gserviceaccount.com`)
4. Set role to **Editor** → Share

The service account can now write to that folder. Files still show up in your  
personal Drive under that folder — you can see and download them normally.

---

## 3. Install rclone on the server

```bash
# Quick install (downloads a single static binary — no dependencies)
curl https://rclone.org/install.sh | sudo bash

# Verify
rclone --version
```

---

## 4. Configure rclone with the Service Account

Copy the JSON key file to the server (scp or paste its contents):

```bash
# Create a directory for the key
sudo mkdir -p /etc/rclone
sudo nano /etc/rclone/gdrive-service-account.json
# Paste the full contents of the downloaded JSON key file, save and exit

sudo chmod 600 /etc/rclone/gdrive-service-account.json
```

Configure rclone (this writes to `/root/.config/rclone/rclone.conf`):

```bash
sudo rclone config
```

Walk through the prompts:
```
n) New remote
name> gdrive
Storage> drive                         # Google Drive
client_id>                             # leave blank
client_secret>                         # leave blank
scope> drive                           # full access
root_folder_id>                        # leave blank
service_account_file> /etc/rclone/gdrive-service-account.json
Edit advanced config? n
Use web browser to authenticate? n     # IMPORTANT: say no for service account
```

Test it:
```bash
# Should list your Google Drive root
sudo rclone ls gdrive:

# Should show the backup folder you shared
sudo rclone ls gdrive:cartoon-reorbit-backups
```

---

## 5. Create the secrets file on the server

```bash
sudo nano /etc/cartoon-reorbit-backup.env
```

Paste:
```bash
DATABASE_URL=postgresql://orbit_user:YOUR_PASSWORD@localhost:5432/orbitdb
BACKUP_DRIVE_REMOTE=gdrive
BACKUP_DRIVE_FOLDER=cartoon-reorbit-backups
```

Lock it down:
```bash
sudo chmod 600 /etc/cartoon-reorbit-backup.env
sudo chown root:root /etc/cartoon-reorbit-backup.env
```

---

## 6. Deploy the scripts to the server

The scripts are in `scripts/` in the repo and deploy automatically with each deploy.  
After deploy, make them executable on the server:

```bash
chmod +x /var/www/cartoon-reorbit/scripts/backup-db.sh
chmod +x /var/www/cartoon-reorbit/scripts/restore-db.sh
```

---

## 7. Test it manually first

```bash
sudo /var/www/cartoon-reorbit/scripts/backup-db.sh
```

Then check your Google Drive — you should see a file like  
`db-2025-05-25T02-00-00Z.sql.gz` in the `cartoon-reorbit-backups` folder.

---

## 8. Schedule with cron

Edit root's crontab (runs as root so it can read `/etc/cartoon-reorbit-backup.env`):

```bash
sudo crontab -e
```

Add one line — this runs at **2:00 AM UTC** every day:

```cron
0 2 * * * /var/www/cartoon-reorbit/scripts/backup-db.sh >> /var/log/cartoon-reorbit-backup.log 2>&1
```

Check the log anytime:
```bash
tail -f /var/log/cartoon-reorbit-backup.log
```

---

## 9. Auto-delete old backups (keep Drive tidy)

rclone has a built-in delete-before-age command. Add a second cron line to  
delete backups older than 30 days right after the upload:

```cron
0 2 * * * /var/www/cartoon-reorbit/scripts/backup-db.sh >> /var/log/cartoon-reorbit-backup.log 2>&1
5 2 * * * rclone delete gdrive:cartoon-reorbit-backups --min-age 30d >> /var/log/cartoon-reorbit-backup.log 2>&1
```

Or set Google Drive's own "trash items older than N days" setting in  
Drive Settings → General → Manage storage.

---

## 10. Restore from a backup

List available backups:
```bash
sudo /var/www/cartoon-reorbit/scripts/restore-db.sh
```

Restore a specific one:
```bash
sudo /var/www/cartoon-reorbit/scripts/restore-db.sh db-2025-05-25T02-00-00Z.sql.gz
```

The restore script downloads the file by streaming it from Drive — again, no  
temp files on disk — and will ask you to type the database name before  
doing anything destructive.

---

## Resource usage summary

| Resource | Impact |
|----------|--------|
| CPU | Low — `pg_dump` is gentle; runs at 2 AM when traffic is lowest |
| RAM | Negligible — bash + pipe, rclone uses ~10 MB while running |
| Disk | Zero — piped directly to Google Drive |
| Network | One outbound upload per day (~varies by DB size) |
| Cost | Free — Google Drive 15 GB free; Google Workspace if you need more |

---

## Troubleshooting

**`pg_dump: error: connection to server failed`**  
→ Check `DATABASE_URL` in `/etc/cartoon-reorbit-backup.env`.

**`rclone: command not found`**  
→ rclone not installed. Run the install script in step 3. Or use full path: `/usr/bin/rclone`.

**`Error: directory not found`**  
→ The Google Drive folder name in `BACKUP_DRIVE_FOLDER` doesn't match exactly, or  
the service account hasn't been shared on it yet (step 2).

**`Failed to copy: googleapi: Error 403: The caller does not have permission`**  
→ The service account email wasn't given Editor access on the Drive folder. Re-check step 2.

**Cron job not running**  
→ Check syslog for cron entries: `grep CRON /var/log/syslog`  
→ Make sure the script is executable: `chmod +x /var/www/cartoon-reorbit/scripts/backup-db.sh`

**Service account config during `rclone config`**  
→ If you accidentally chose browser auth, just run `sudo rclone config` again,  
delete the remote, and recreate it. The config file is at `/root/.config/rclone/rclone.conf`.

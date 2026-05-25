# Database Backup Setup — PostgreSQL → AWS S3

Lightweight, low-resource setup: one bash script, one system cron job.  
Zero extra Node.js processes. Zero disk usage (pipes directly to S3).

---

## How it works

```
pg_dump → gzip → aws s3 cp stdin → s3://your-bucket/backups/cartoon-reorbit/db-<timestamp>.sql.gz
```

The dump is piped in one shot — nothing is written to the server's disk.  
S3 Lifecycle rules automatically delete backups older than N days.

---

## 1. Create an AWS IAM user (write-only, least privilege)

In the AWS Console → IAM → Users → Create user: `cartoon-reorbit-backup`

Attach an **inline policy** (not a managed policy — keeps it minimal):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "BackupUpload",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::YOUR-BUCKET-NAME",
        "arn:aws:s3:::YOUR-BUCKET-NAME/backups/cartoon-reorbit/*"
      ]
    }
  ]
}
```

> `GetObject` and `ListBucket` are only needed for the restore script.  
> If you want write-only, remove them — restores will need a different user.

Generate an **Access Key** for this user and save the key + secret.

---

## 2. Create the S3 bucket

```bash
aws s3 mb s3://YOUR-BUCKET-NAME --region us-east-1
```

**Block all public access** (enabled by default on new buckets — leave it on).

**Enable versioning** (optional but recommended — S3 versioning protects against accidental overwrites):
```bash
aws s3api put-bucket-versioning \
  --bucket YOUR-BUCKET-NAME \
  --versioning-configuration Status=Enabled
```

**Set a Lifecycle rule** to auto-delete old backups (saves cost):

In AWS Console → S3 → Your bucket → Management → Lifecycle rules → Create rule:
- Rule name: `expire-old-backups`
- Prefix: `backups/cartoon-reorbit/`
- Expiration: **30 days** (adjust to taste)

Or via CLI:
```bash
aws s3api put-bucket-lifecycle-configuration \
  --bucket YOUR-BUCKET-NAME \
  --lifecycle-configuration '{
    "Rules": [{
      "ID": "expire-old-backups",
      "Filter": {"Prefix": "backups/cartoon-reorbit/"},
      "Status": "Enabled",
      "Expiration": {"Days": 30}
    }]
  }'
```

---

## 3. Install AWS CLI on the server

```bash
# Check if already installed
aws --version

# If not, install (Ubuntu/Debian)
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o /tmp/awscliv2.zip
unzip /tmp/awscliv2.zip -d /tmp/
sudo /tmp/aws/install
aws --version
```

---

## 4. Create the secrets file on the server

Store credentials in a root-only file — **not** in the .env that the app reads:

```bash
sudo nano /etc/cartoon-reorbit-backup.env
```

Paste:
```bash
DATABASE_URL=postgresql://orbit_user:YOUR_PASSWORD@localhost:5432/orbitdb
BACKUP_S3_BUCKET=YOUR-BUCKET-NAME
AWS_ACCESS_KEY_ID=AKIAxxxxxxxxxxxxxxxxx
AWS_SECRET_ACCESS_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
AWS_DEFAULT_REGION=us-east-1

# Optional overrides:
# BACKUP_S3_PREFIX=backups/cartoon-reorbit
# BACKUP_RETAIN_DAYS=30
# BACKUP_LOG_FILE=/var/log/cartoon-reorbit-backup.log
```

Lock it down:
```bash
sudo chmod 600 /etc/cartoon-reorbit-backup.env
sudo chown root:root /etc/cartoon-reorbit-backup.env
```

---

## 5. Deploy the scripts to the server

The scripts live in `scripts/` in this repo and deploy automatically with each deploy.  
After deploy, make them executable on the server:

```bash
chmod +x /var/www/cartoon-reorbit/scripts/backup-db.sh
chmod +x /var/www/cartoon-reorbit/scripts/restore-db.sh
```

---

## 6. Test it manually first

```bash
sudo /var/www/cartoon-reorbit/scripts/backup-db.sh
```

Check S3 to confirm the file appeared:
```bash
aws s3 ls s3://YOUR-BUCKET-NAME/backups/cartoon-reorbit/ \
  --profile default  # or remove --profile if using env vars
```

---

## 7. Schedule with cron

Edit root's crontab (runs as root so it can read `/etc/cartoon-reorbit-backup.env`):

```bash
sudo crontab -e
```

Add one line — this runs at **2:00 AM UTC** every day:

```cron
0 2 * * * /var/www/cartoon-reorbit/scripts/backup-db.sh >> /var/log/cartoon-reorbit-backup.log 2>&1
```

The script itself also appends to that log file with timestamps.  
Check the log anytime with:
```bash
tail -f /var/log/cartoon-reorbit-backup.log
```

---

## 8. Restore from a backup

List available backups:
```bash
/var/www/cartoon-reorbit/scripts/restore-db.sh
```

Restore a specific one:
```bash
/var/www/cartoon-reorbit/scripts/restore-db.sh db-2025-05-25T02-00-00Z.sql.gz
```

The restore script will ask you to type the database name before doing anything destructive.

---

## Resource usage summary

| Resource | Impact |
|----------|--------|
| CPU | Low — `pg_dump` is gentle; runs 2 AM when traffic is lowest |
| RAM | Negligible — bash + pipe, no Node process |
| Disk | Zero — piped directly to S3 |
| Network | One outbound upload per day (~varies by DB size) |
| Cost (S3) | ~$0.023/GB/month (STANDARD_IA class) + tiny PUT cost |

---

## Troubleshooting

**`pg_dump: error: connection to server failed`**  
→ Check `DATABASE_URL` in `/etc/cartoon-reorbit-backup.env` — password or host may be wrong.

**`aws: command not found`**  
→ AWS CLI not installed — see step 3. Or use full path: `/usr/local/bin/aws`

**`An error occurred (AccessDenied)`**  
→ IAM policy is missing the `s3:PutObject` permission on the bucket/prefix.

**Cron job not running**  
→ Check `/var/log/syslog` for cron entries: `grep CRON /var/log/syslog`

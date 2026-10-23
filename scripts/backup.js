const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const DB_URL = 'https://last-chaos-2387e-default-rtdb.europe-west1.firebasedatabase.app';
const BACKUP_DIR = 'backups';
const RETENTION_DAYS = 30; // delete backups older than this

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: DB_URL
});

async function main() {
  const db = admin.database();
  const snapshot = await db.ref('observations').once('value');
  const data = snapshot.val() || {};

  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 16); // 2026-10-23T14-00
  const filename = `backup-${stamp}.json`;
  fs.writeFileSync(path.join(BACKUP_DIR, filename), JSON.stringify(data, null, 2));

  // Retention: delete files older than RETENTION_DAYS
  const cutoff = Date.now() - RETENTION_DAYS * 86400 * 1000;
  for (const f of fs.readdirSync(BACKUP_DIR)) {
    if (!f.startsWith('backup-')) continue;
    const full = path.join(BACKUP_DIR, f);
    if (fs.statSync(full).mtimeMs < cutoff) fs.unlinkSync(full);
  }

  // Rebuild manifest
  const files = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith('backup-') && f.endsWith('.json'))
    .sort()
    .reverse(); // newest first

  const manifest = {
    generated: now.toISOString(),
    count: files.length,
    retentionDays: RETENTION_DAYS,
    backups: files.map(f => {
      const stats = fs.statSync(path.join(BACKUP_DIR, f));
      return { filename: f, size: stats.size, mtime: new Date(stats.mtimeMs).toISOString() };
    })
  };
  fs.writeFileSync(path.join(BACKUP_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));

  console.log(`✅ Saved ${filename} (${Object.keys(data).length} observations, ${files.length} total backups)`);
}

main().catch(err => { console.error('❌ Backup failed:', err); process.exit(1); });

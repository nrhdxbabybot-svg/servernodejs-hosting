const express = require('express');
const { exec, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { db } = require('../database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
const APPS_DIR = process.env.APPS_DIR || '/home/apps';

// Helper: jalankan command dan return promise
function runCommand(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, { timeout: 30000 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve(stdout.trim());
    });
  });
}

// Helper: cek apakah PM2 tersedia
async function isPM2Available() {
  try {
    await runCommand('pm2 --version');
    return true;
  } catch {
    return false;
  }
}

// GET /api/apps - daftar app milik user
router.get('/', authMiddleware, (req, res) => {
  const apps = db.prepare(`
    SELECT a.*, 
      (SELECT COUNT(*) FROM domains d WHERE d.app_id = a.id) as domain_count
    FROM apps a 
    WHERE a.user_id = ?
    ORDER BY a.created_at DESC
  `).all(req.user.id);
  res.json(apps);
});

// POST /api/apps - buat app baru
router.post('/', authMiddleware, (req, res) => {
  try {
    const { name, type, start_command } = req.body;

    if (!name) return res.status(400).json({ error: 'Nama app wajib diisi' });
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
      return res.status(400).json({ error: 'Nama app hanya boleh huruf, angka, dash, underscore' });
    }

    // Cek duplikat nama untuk user ini
    const existing = db.prepare('SELECT id FROM apps WHERE user_id = ? AND name = ?').get(req.user.id, name);
    if (existing) return res.status(409).json({ error: 'Nama app sudah digunakan' });

    // Gunakan port yang sudah di-assign ke user
    const user = db.prepare('SELECT port_assigned FROM users WHERE id = ?').get(req.user.id);
    
    // Cek apakah user sudah punya app (1 user = 1 app per port)
    const appCount = db.prepare('SELECT COUNT(*) as cnt FROM apps WHERE user_id = ?').get(req.user.id);
    if (appCount.cnt >= 5) {
      return res.status(400).json({ error: 'Maksimal 5 app per user' });
    }

    // Hitung port untuk app ini
    const port = user.port_assigned + appCount.cnt;
    const appDir = path.join(APPS_DIR, req.user.username, name);
    const appType = type || 'nodejs';
    const startCmd = start_command || (appType === 'python' ? 'python app.py' : 'node index.js');

    const result = db.prepare(`
      INSERT INTO apps (user_id, name, type, port, app_dir, start_command)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(req.user.id, name, appType, port, appDir, startCmd);

    const app = db.prepare('SELECT * FROM apps WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ message: 'App berhasil dibuat', app });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal membuat app' });
  }
});

// POST /api/apps/:id/start
router.post('/:id/start', authMiddleware, async (req, res) => {
  try {
    const app = db.prepare('SELECT * FROM apps WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!app) return res.status(404).json({ error: 'App tidak ditemukan' });

    const pm2Available = await isPM2Available();
    if (!pm2Available) {
      return res.status(500).json({ error: 'PM2 tidak tersedia di server' });
    }

    // Pastikan direktori app ada
    if (!fs.existsSync(app.app_dir)) {
      fs.mkdirSync(app.app_dir, { recursive: true });
      // Buat file placeholder
      const placeholder = app.type === 'python'
        ? `from http.server import HTTPServer, BaseHTTPRequestHandler\nimport os\n\nclass Handler(BaseHTTPRequestHandler):\n    def do_GET(self):\n        self.send_response(200)\n        self.end_headers()\n        self.wfile.write(b'Hello from ${app.name}!')\n\nport = int(os.environ.get('PORT', ${app.port}))\nHTTPServer(('0.0.0.0', port), Handler).serve_forever()\n`
        : `const http = require('http');\nconst PORT = process.env.PORT || ${app.port};\nhttp.createServer((req, res) => {\n  res.end('Hello from ${app.name}!');\n}).listen(PORT, () => console.log('Running on port ' + PORT));\n`;
      const filename = app.type === 'python' ? 'app.py' : 'index.js';
      fs.writeFileSync(path.join(app.app_dir, filename), placeholder);
    }

    const pm2Name = `${req.user.username}-${app.name}`;
    const cmd = `cd "${app.app_dir}" && PORT=${app.port} pm2 start ${app.start_command} --name "${pm2Name}" --no-autorestart`;

    await runCommand(`pm2 delete "${pm2Name}" 2>/dev/null || true`);
    await runCommand(cmd);
    await runCommand('pm2 save');

    db.prepare('UPDATE apps SET status = ?, pm2_id = ? WHERE id = ?').run('running', pm2Name, app.id);

    res.json({ message: 'App berhasil distart', status: 'running' });
  } catch (err) {
    console.error('Start error:', err);
    db.prepare('UPDATE apps SET status = ? WHERE id = ?').run('error', req.params.id);
    res.status(500).json({ error: 'Gagal start app: ' + err.message });
  }
});

// POST /api/apps/:id/stop
router.post('/:id/stop', authMiddleware, async (req, res) => {
  try {
    const app = db.prepare('SELECT * FROM apps WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!app) return res.status(404).json({ error: 'App tidak ditemukan' });

    if (app.pm2_id) {
      await runCommand(`pm2 stop "${app.pm2_id}" 2>/dev/null || true`);
      await runCommand('pm2 save');
    }

    db.prepare('UPDATE apps SET status = ? WHERE id = ?').run('stopped', app.id);
    res.json({ message: 'App berhasil distop', status: 'stopped' });
  } catch (err) {
    res.status(500).json({ error: 'Gagal stop app: ' + err.message });
  }
});

// POST /api/apps/:id/restart
router.post('/:id/restart', authMiddleware, async (req, res) => {
  try {
    const app = db.prepare('SELECT * FROM apps WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!app) return res.status(404).json({ error: 'App tidak ditemukan' });

    if (app.pm2_id) {
      await runCommand(`pm2 restart "${app.pm2_id}" 2>/dev/null || true`);
    }

    db.prepare('UPDATE apps SET status = ? WHERE id = ?').run('running', app.id);
    res.json({ message: 'App berhasil direstart', status: 'running' });
  } catch (err) {
    res.status(500).json({ error: 'Gagal restart app: ' + err.message });
  }
});

// GET /api/apps/:id/logs
router.get('/:id/logs', authMiddleware, async (req, res) => {
  try {
    const app = db.prepare('SELECT * FROM apps WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!app) return res.status(404).json({ error: 'App tidak ditemukan' });
    if (!app.pm2_id) return res.json({ logs: 'App belum pernah distart.' });

    const lines = parseInt(req.query.lines) || 50;
    const logs = await runCommand(`pm2 logs "${app.pm2_id}" --lines ${lines} --nostream 2>&1 || echo "Tidak ada log"`);
    res.json({ logs });
  } catch (err) {
    res.json({ logs: 'Gagal mengambil logs: ' + err.message });
  }
});

// DELETE /api/apps/:id
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const app = db.prepare('SELECT * FROM apps WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!app) return res.status(404).json({ error: 'App tidak ditemukan' });

    // Hapus dari PM2
    if (app.pm2_id) {
      await runCommand(`pm2 delete "${app.pm2_id}" 2>/dev/null || true`);
      await runCommand('pm2 save');
    }

    // Hapus domain dan nginx config terkait
    const domains = db.prepare('SELECT * FROM domains WHERE app_id = ?').all(app.id);
    const nginxAvail = process.env.NGINX_SITES_PATH || '/etc/nginx/sites-available';
    const nginxEnabled = process.env.NGINX_ENABLED_PATH || '/etc/nginx/sites-enabled';
    
    for (const domain of domains) {
      const confPath = path.join(nginxAvail, domain.domain);
      const linkPath = path.join(nginxEnabled, domain.domain);
      try {
        if (fs.existsSync(linkPath)) fs.unlinkSync(linkPath);
        if (fs.existsSync(confPath)) fs.unlinkSync(confPath);
      } catch (e) { /* ignore */ }
    }

    // Reload nginx jika ada perubahan domain
    if (domains.length > 0) {
      try { await runCommand('nginx -t && systemctl reload nginx'); } catch (e) { /* ignore */ }
    }

    db.prepare('DELETE FROM apps WHERE id = ?').run(app.id);
    res.json({ message: 'App berhasil dihapus' });
  } catch (err) {
    res.status(500).json({ error: 'Gagal hapus app: ' + err.message });
  }
});

module.exports = router;

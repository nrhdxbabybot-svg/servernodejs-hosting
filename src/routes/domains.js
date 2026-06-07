const express = require('express');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { db } = require('../database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

const NGINX_SITES_PATH = process.env.NGINX_SITES_PATH || '/etc/nginx/sites-available';
const NGINX_ENABLED_PATH = process.env.NGINX_ENABLED_PATH || '/etc/nginx/sites-enabled';
const BASE_DOMAIN = process.env.BASE_DOMAIN || 'domainmu.com';
const SERVER_IP = process.env.SERVER_IP || '127.0.0.1';

function runCommand(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, { timeout: 15000 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve(stdout.trim());
    });
  });
}

// Generate nginx config untuk satu domain
function generateNginxConfig(domain, port) {
  return `server {
    listen 80;
    listen [::]:80;
    server_name ${domain};

    location / {
        proxy_pass http://127.0.0.1:${port};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_connect_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN";
    add_header X-Content-Type-Options "nosniff";
    add_header X-XSS-Protection "1; mode=block";
}
`;
}

// GET /api/domains - daftar domain milik user
router.get('/', authMiddleware, (req, res) => {
  const domains = db.prepare(`
    SELECT d.*, a.name as app_name, a.port, a.status as app_status
    FROM domains d
    JOIN apps a ON a.id = d.app_id
    WHERE d.user_id = ?
    ORDER BY d.created_at DESC
  `).all(req.user.id);
  res.json(domains);
});

// POST /api/domains/subdomain - tambah subdomain gratis (namauser-appname.domain.com)
router.post('/subdomain', authMiddleware, async (req, res) => {
  try {
    const { app_id } = req.body;
    if (!app_id) return res.status(400).json({ error: 'app_id wajib diisi' });

    const app = db.prepare('SELECT * FROM apps WHERE id = ? AND user_id = ?').get(app_id, req.user.id);
    if (!app) return res.status(404).json({ error: 'App tidak ditemukan' });

    const subdomain = `${req.user.username}.${BASE_DOMAIN}`;

    // Cek duplikat
    const existing = db.prepare('SELECT id FROM domains WHERE domain = ?').get(subdomain);
    if (existing) return res.status(409).json({ error: 'Subdomain ini sudah digunakan' });

    // Generate nginx config
    const configContent = generateNginxConfig(subdomain, app.port);
    const configPath = path.join(NGINX_SITES_PATH, subdomain);
    const linkPath = path.join(NGINX_ENABLED_PATH, subdomain);

    fs.writeFileSync(configPath, configContent);
    
    // Buat symlink jika belum ada
    if (!fs.existsSync(linkPath)) {
      fs.symlinkSync(configPath, linkPath);
    }

    // Test dan reload nginx
    await runCommand('nginx -t');
    await runCommand('systemctl reload nginx');

    const result = db.prepare(`
      INSERT INTO domains (user_id, app_id, domain, type, nginx_config_path)
      VALUES (?, ?, ?, 'subdomain', ?)
    `).run(req.user.id, app_id, subdomain, configPath);

    const domain = db.prepare('SELECT * FROM domains WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({
      message: 'Subdomain berhasil dibuat',
      domain,
      url: `http://${subdomain}`
    });
  } catch (err) {
    console.error('Subdomain error:', err);
    res.status(500).json({ error: 'Gagal membuat subdomain: ' + err.message });
  }
});

// POST /api/domains/custom - tambah domain sendiri
router.post('/custom', authMiddleware, async (req, res) => {
  try {
    const { app_id, domain } = req.body;

    if (!app_id || !domain) {
      return res.status(400).json({ error: 'app_id dan domain wajib diisi' });
    }

    // Validasi format domain
    const domainRegex = /^([a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
    if (!domainRegex.test(domain)) {
      return res.status(400).json({ error: 'Format domain tidak valid' });
    }

    // Cegah pengguna mendaftarkan domain milik panel atau base domain
    if (domain === BASE_DOMAIN || domain.endsWith('.' + BASE_DOMAIN)) {
      return res.status(400).json({ error: 'Tidak bisa mendaftarkan domain sistem' });
    }

    const app = db.prepare('SELECT * FROM apps WHERE id = ? AND user_id = ?').get(app_id, req.user.id);
    if (!app) return res.status(404).json({ error: 'App tidak ditemukan' });

    const existing = db.prepare('SELECT id FROM domains WHERE domain = ?').get(domain);
    if (existing) return res.status(409).json({ error: 'Domain ini sudah terdaftar' });

    // Generate nginx config
    const configContent = generateNginxConfig(domain, app.port);
    const configPath = path.join(NGINX_SITES_PATH, domain);
    const linkPath = path.join(NGINX_ENABLED_PATH, domain);

    fs.writeFileSync(configPath, configContent);
    if (!fs.existsSync(linkPath)) {
      fs.symlinkSync(configPath, linkPath);
    }

    await runCommand('nginx -t');
    await runCommand('systemctl reload nginx');

    const result = db.prepare(`
      INSERT INTO domains (user_id, app_id, domain, type, nginx_config_path)
      VALUES (?, ?, ?, 'custom', ?)
    `).run(req.user.id, app_id, domain, configPath);

    const saved = db.prepare('SELECT * FROM domains WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({
      message: 'Domain berhasil ditambahkan',
      domain: saved,
      instruction: `Arahkan DNS A record domain ${domain} ke IP: ${SERVER_IP}`,
      url: `http://${domain}`
    });
  } catch (err) {
    console.error('Custom domain error:', err);
    res.status(500).json({ error: 'Gagal menambah domain: ' + err.message });
  }
});

// DELETE /api/domains/:id - hapus domain
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const domain = db.prepare('SELECT * FROM domains WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!domain) return res.status(404).json({ error: 'Domain tidak ditemukan' });

    const linkPath = path.join(NGINX_ENABLED_PATH, domain.domain);
    const confPath = path.join(NGINX_SITES_PATH, domain.domain);

    try {
      if (fs.existsSync(linkPath)) fs.unlinkSync(linkPath);
      if (fs.existsSync(confPath)) fs.unlinkSync(confPath);
      await runCommand('nginx -t && systemctl reload nginx');
    } catch (e) {
      console.warn('Nginx cleanup warning:', e.message);
    }

    db.prepare('DELETE FROM domains WHERE id = ?').run(domain.id);
    res.json({ message: 'Domain berhasil dihapus' });
  } catch (err) {
    res.status(500).json({ error: 'Gagal hapus domain: ' + err.message });
  }
});

module.exports = router;

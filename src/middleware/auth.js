const jwt = require('jsonwebtoken');
const { db } = require('../database');

function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>

  if (!token) {
    return res.status(401).json({ error: 'Token tidak ditemukan' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = db.prepare('SELECT id, username, email, role, is_active FROM users WHERE id = ?').get(decoded.userId);

    if (!user || !user.is_active) {
      return res.status(401).json({ error: 'Akun tidak aktif atau tidak ditemukan' });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Token tidak valid atau sudah expired' });
  }
}

function adminMiddleware(req, res, next) {
  authMiddleware(req, res, () => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Akses ditolak: hanya admin' });
    }
    next();
  });
}

module.exports = { authMiddleware, adminMiddleware };

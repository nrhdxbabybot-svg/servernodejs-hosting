require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 menit
  max: 100,
  message: { error: 'Terlalu banyak request, coba lagi nanti.' }
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Terlalu banyak percobaan login.' }
});

app.use('/api/', limiter);
app.use('/api/auth/', authLimiter);

// Init database
const db = require('./src/database');
db.init();

// Routes
app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/apps', require('./src/routes/apps'));
app.use('/api/domains', require('./src/routes/domains'));
app.use('/api/admin', require('./src/routes/admin'));

// Frontend - serve index.html untuk semua route non-api
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`\n🚀 Hosting Panel running on port ${PORT}`);
  console.log(`   Local:  http://localhost:${PORT}`);
  console.log(`   Panel:  http://${process.env.SERVER_IP}:${PORT}\n`);
});

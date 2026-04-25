require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const matchesRouter = require('./routes/matches');
const betsRouter = require('./routes/bets');
const bonusRouter = require('./routes/bonus');
const rankingRouter = require('./routes/ranking');
const usersRouter = require('./routes/users');
const adminRouter = require('./routes/admin');

const app = express();

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 200,
  standardHeaders: true,
  legacyHeaders: false
});
app.use(limiter);

app.use(express.json({ limit: '10kb' }));

// Routes
app.use('/api/matches', matchesRouter);
app.use('/api/bets', betsRouter);
app.use('/api/bonus', bonusRouter);
app.use('/api/ranking', rankingRouter);
app.use('/api/users', usersRouter);
app.use('/api/admin', adminRouter);

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// 404
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 CS2 Typer API running on port ${PORT}`);
});

'use strict';

require('dotenv').config();

const express          = require('express');
const cors             = require('cors');
const mongoose         = require('mongoose');
const cron             = require('node-cron');
const { runScrapeJob } = require('./scraper');
const TrackingRequest  = require('./models/TrackingRequest');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── CORS — must be first middleware ──────────────────────────────────────────
app.use(cors({ origin: '*' }));
app.use(express.json());

// ── MongoDB connection ────────────────────────────────────────────────────────
const MONGODB_URI = process.env.MONGODB_URI;
if (MONGODB_URI) {
  mongoose.connect(MONGODB_URI)
    .then(() => console.log('[DB] MongoDB connected ✓'))
    .catch((err) => console.error('[DB] Connection failed:', err.message));
} else {
  console.warn('[DB] MONGODB_URI not set — add it as a Railway env variable.');
}

function isValidBookingUrl(url) {
  try {
    const p = new URL(url);
    return p.hostname === 'www.booking.com' && p.pathname.includes('/hotel/');
  } catch { return false; }
}

// ── POST /api/track — add or update a tracked package ────────────────────────
app.post('/api/track', async (req, res) => {
  const { url, roomPackage, targetPrice, email, telegram, telegramChatId } = req.body;

  if (!url || !roomPackage || targetPrice === undefined || targetPrice === null)
    return res.status(400).json({ error: "'url', 'roomPackage', and 'targetPrice' are required." });
  if (!isValidBookingUrl(url))
    return res.status(400).json({ error: 'URL must be a valid Booking.com hotel page.' });
  if (typeof roomPackage !== 'string' || !roomPackage.trim())
    return res.status(400).json({ error: "'roomPackage' must be a non-empty string." });

  const price = parseFloat(targetPrice);
  if (isNaN(price) || price <= 0)
    return res.status(400).json({ error: "'targetPrice' must be a positive number." });

  try {
    const filter = { url, roomPackage: roomPackage.trim() };
    const update = {
      $set: {
        targetPrice:    price,
        email:          email          || null,
        telegram:       telegram === true,
        telegramChatId: telegramChatId || null,
      },
      $setOnInsert: { alertCount: 0 },
    };
    const doc = await TrackingRequest.findOneAndUpdate(filter, update, {
      new:    true,
      upsert: true,
      setDefaultsOnInsert: true,
      runValidators: true,
    });

    const isNew = doc.addedAt.getTime() === doc.updatedAt.getTime();
    const channels = [doc.email && 'email', doc.telegram && 'telegram'].filter(Boolean).join(', ') || 'none';
    console.log(`[${isNew ? 'ADDED' : 'UPDATED'}] "${doc.roomPackage}" at ${url} → ₪${price} — notify: ${channels}`);

    return res.status(200).json({
      message: isNew ? 'Tracking started successfully.' : 'Tracking updated successfully.',
      entry:   doc,
    });
  } catch (err) {
    console.error('[POST /api/track] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /api/track — list all tracked packages ────────────────────────────────
app.get('/api/track', async (_req, res) => {
  try {
    const hotels = await TrackingRequest.find().sort({ addedAt: -1 }).lean();
    res.json({ count: hotels.length, hotels });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/track/:id — stop tracking ─────────────────────────────────────
app.delete('/api/track/:id', async (req, res) => {
  try {
    const doc = await TrackingRequest.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ error: `No entry found with id '${req.params.id}'.` });
    console.log(`[REMOVED] Stopped tracking id: ${req.params.id}`);
    res.json({ message: 'Tracking removed successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/scrape — manually trigger a scrape ──────────────────────────────
app.post('/api/scrape', (_req, res) => {
  res.json({ message: 'Scrape job triggered. Check server logs.' });
  runScrapeJob().catch((err) => console.error('[Scraper] Manual run failed:', err.message));
});

// ── GET /health ───────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status:   'ok',
    db:       mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
  });
});

// ── Cron — every 2 hours ──────────────────────────────────────────────────────
cron.schedule('0 */2 * * *', () => {
  console.log(`[Cron] Firing scrape at ${new Date().toISOString()}`);
  runScrapeJob().catch((err) => console.error('[Cron] Failed:', err.message));
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\nBooking Price Tracker — port ${PORT}`);
  console.log(`  POST   /api/track     — Add/update tracking`);
  console.log(`  GET    /api/track     — List all entries`);
  console.log(`  DELETE /api/track/:id — Stop tracking`);
  console.log(`  POST   /api/scrape    — Manual scrape`);
  console.log(`  GET    /health        — Health check`);
  console.log(`\nEmail   : ${process.env.EMAIL_USER        ? '✓ ' + process.env.EMAIL_USER : '✗ not set'}`);
  console.log(`Telegram: ${process.env.TELEGRAM_BOT_TOKEN ? '✓ configured'               : '✗ not set'}`);
  console.log(`MongoDB : ${MONGODB_URI                    ? '✓ URI present'              : '✗ MONGODB_URI not set'}\n`);
});

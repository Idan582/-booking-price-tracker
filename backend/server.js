'use strict';

require('dotenv').config(); // load .env before anything else

const express          = require('express');
const cors             = require('cors');
const fs               = require('fs');
const path             = require('path');
const cron             = require('node-cron');
const { runScrapeJob } = require('./scraper');

const app      = express();
const PORT     = process.env.PORT || 3001;
const DATA_FILE = path.join(__dirname, 'tracked_hotels.json');

// ── CORS ─────────────────────────────────────────────────────────────────────
// Allow requests from:
//   • Booking.com pages (content script fetch origin)
//   • Chrome extension background / popup
//   • localhost (dev / testing)

app.use(cors({
  origin: true,           // reflect any origin — host_permissions in the manifest is the real gate
  methods:        ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
}));

app.use(express.json());

// ── Helpers ───────────────────────────────────────────────────────────────────

function loadTrackedHotels() {
  if (!fs.existsSync(DATA_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

function saveTrackedHotels(hotels) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(hotels, null, 2), 'utf-8');
}

function isValidBookingUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname === 'www.booking.com' && parsed.pathname.includes('/hotel/');
  } catch {
    return false;
  }
}

// ── Routes ────────────────────────────────────────────────────────────────────

// POST /api/track — add or update a tracked package
app.post('/api/track', (req, res) => {
  const { url, roomPackage, targetPrice, email, telegram, telegramChatId } = req.body;

  if (!url || !roomPackage || targetPrice === undefined || targetPrice === null) {
    return res.status(400).json({ error: "'url', 'roomPackage', and 'targetPrice' are all required." });
  }
  if (!isValidBookingUrl(url)) {
    return res.status(400).json({ error: 'URL must be a valid Booking.com hotel page.' });
  }
  if (typeof roomPackage !== 'string' || roomPackage.trim() === '') {
    return res.status(400).json({ error: "'roomPackage' must be a non-empty string." });
  }

  const price = parseFloat(targetPrice);
  if (isNaN(price) || price <= 0) {
    return res.status(400).json({ error: "'targetPrice' must be a positive number." });
  }

  const hotels       = loadTrackedHotels();
  const existingIndex = hotels.findIndex(
    (h) => h.url === url && h.roomPackage === roomPackage.trim()
  );

  const prev  = existingIndex >= 0 ? hotels[existingIndex] : {};
  const entry = {
    id:          existingIndex >= 0 ? prev.id : Date.now().toString(),
    url,
    roomPackage: roomPackage.trim(),
    targetPrice: price,
    email:          email          || prev.email          || null,
    telegram:       telegram === true || prev.telegram === true,
    telegramChatId: telegramChatId || prev.telegramChatId || null,
    addedAt:     existingIndex >= 0 ? prev.addedAt : new Date().toISOString(),
    updatedAt:   new Date().toISOString(),
  };

  if (existingIndex >= 0) {
    hotels[existingIndex] = entry;
    console.log(`[UPDATED] "${entry.roomPackage}" at ${url} → ₪${price}`);
  } else {
    hotels.push(entry);
    const channels = [entry.email && 'email', entry.telegram && 'telegram'].filter(Boolean).join(', ') || 'none';
    console.log(`[ADDED]   "${entry.roomPackage}" at ${url} — target ₪${price} — notify via ${channels}`);
  }

  saveTrackedHotels(hotels);
  return res.status(200).json({
    message: existingIndex >= 0 ? 'Tracking updated successfully.' : 'Tracking started successfully.',
    entry,
  });
});

// GET /api/track — list all tracked packages
app.get('/api/track', (_req, res) => {
  const hotels = loadTrackedHotels();
  res.json({ count: hotels.length, hotels });
});

// DELETE /api/track/:id — stop tracking
app.delete('/api/track/:id', (req, res) => {
  const { id } = req.params;
  let hotels    = loadTrackedHotels();
  const before  = hotels.length;
  hotels        = hotels.filter((h) => h.id !== id);

  if (hotels.length === before) {
    return res.status(404).json({ error: `No tracked hotel found with id '${id}'.` });
  }

  saveTrackedHotels(hotels);
  console.log(`[REMOVED] Stopped tracking id: ${id}`);
  res.json({ message: 'Tracking removed successfully.' });
});

// POST /api/scrape — manually trigger a scrape run (useful for testing)
app.post('/api/scrape', (_req, res) => {
  res.json({ message: 'Scrape job triggered. Check server logs for progress.' });
  runScrapeJob().catch((err) => console.error('[Scraper] Manual run failed:', err.message));
});

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Cron job ─────────────────────────────────────────────────────────────────
// Runs at minute 0 of every 2nd hour: 00:00, 02:00, 04:00, ..., 22:00

cron.schedule('0 */2 * * *', () => {
  console.log(`[Cron] Firing scheduled scrape at ${new Date().toISOString()}`);
  runScrapeJob().catch((err) => {
    console.error('[Cron] Scrape job failed:', err.message);
  });
});

// ── Start server ──────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\nBooking Price Tracker backend — http://localhost:${PORT}`);
  console.log(`Data file : ${DATA_FILE}`);
  console.log('\nEndpoints:');
  console.log(`  POST   /api/track        — Add/update a hotel to track`);
  console.log(`  GET    /api/track        — List all tracked hotels`);
  console.log(`  DELETE /api/track/:id    — Stop tracking`);
  console.log(`  POST   /api/scrape       — Trigger a manual scrape run`);
  console.log(`  GET    /health           — Health check`);
  console.log('\nCron: scrape runs every 2 hours (0 */2 * * *)');
  console.log('Email  :', process.env.EMAIL_USER     ? `✓ ${process.env.EMAIL_USER}` : '✗ not configured (set EMAIL_USER / EMAIL_PASS in .env)');
  console.log('Telegram:', process.env.TELEGRAM_BOT_TOKEN ? '✓ configured' : '✗ not configured (set TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID in .env)');
  console.log();
});

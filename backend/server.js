'use strict';

require('dotenv').config();

const express          = require('express');
const cors             = require('cors');
const mongoose         = require('mongoose');
const cron             = require('node-cron');
const { runScrapeJob }    = require('./scraper');
const TrackingRequest     = require('./models/TrackingRequest');
const { renderAdminPage } = require('./adminPage');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Pure Node.js Basic Auth (no external packages) — Railway Deploy Trigger ───
const adminAuth = (req, res, next) => {
  const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
  const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');

  console.log("--- Auth Debug ---");
  console.log("1. ENV Username:", process.env.ADMIN_USERNAME ? `Set (${process.env.ADMIN_USERNAME.length} chars)` : "UNDEFINED");
  console.log("2. ENV Password:", process.env.ADMIN_PASSWORD ? "Set (hidden)" : "UNDEFINED");
  console.log("3. User typed login:", login ? `Set (${login.length} chars)` : "UNDEFINED");
  if (login && password && login === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
    return next();
  }

  res.set('WWW-Authenticate', 'Basic realm="Admin Area"');
  res.status(401).send('Authentication required.');
};

// ── Global middleware ─────────────────────────────────────────────────────────
app.use(cors({ origin: '*' }));
app.use(express.json());

// ── MongoDB ───────────────────────────────────────────────────────────────────
const MONGODB_URI = process.env.MONGODB_URI;
if (MONGODB_URI) {
  mongoose.connect(MONGODB_URI)
    .then(() => console.log('[DB] MongoDB connected ✓'))
    .catch((err) => console.error('[DB] Connection failed:', err.message));
} else {
  console.warn('[DB] MONGODB_URI not set — add it as a Railway env variable.');
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function isValidBookingUrl(url) {
  try {
    const p = new URL(url);
    return p.hostname === 'www.booking.com' && p.pathname.includes('/hotel/');
  } catch { return false; }
}

// ── POST /api/track  (public — called by the Chrome extension) ───────────────
app.post('/api/track', async (req, res) => {
  const {
    url, roomPackage, roomType, targetPrice, originalPrice,
    hotelName, checkIn, checkOut, guests, rooms,
    email, telegram, telegramChatId,
  } = req.body;

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
    const parsedOriginal = (originalPrice != null && !isNaN(parseFloat(originalPrice)))
      ? parseFloat(originalPrice) : null;

    const update = {
      $set: {
        targetPrice:    price,
        email:          email          || null,
        telegram:       telegram === true,
        telegramChatId: telegramChatId || null,
        ...(parsedOriginal                           && { originalPrice: parsedOriginal }),
        ...(roomType                                 && { roomType }),
        ...(hotelName                                && { hotelName }),
        ...(checkIn                                  && { checkIn }),
        ...(checkOut                                 && { checkOut }),
        ...(guests != null && !isNaN(Number(guests)) && { guests: Number(guests) }),
        ...(rooms  != null && !isNaN(Number(rooms))  && { rooms:  Number(rooms)  }),
      },
      $setOnInsert: { alertCount: 0 },
    };

    const doc = await TrackingRequest.findOneAndUpdate(filter, update, {
      new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true,
    });

    const isNew    = doc.addedAt.getTime() === doc.updatedAt.getTime();
    const channels = [doc.email && 'email', doc.telegram && 'telegram'].filter(Boolean).join(', ') || 'none';
    console.log(`[${isNew ? 'ADDED' : 'UPDATED'}] "${doc.roomPackage}" → ₪${price} — notify: ${channels}`);

    return res.status(200).json({
      message: isNew ? 'Tracking started successfully.' : 'Tracking updated successfully.',
      entry:   doc,
    });
  } catch (err) {
    console.error('[POST /api/track] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /api/track  (admin) ───────────────────────────────────────────────────
app.get('/api/track', adminAuth, async (_req, res) => {
  try {
    const hotels = await TrackingRequest.find().sort({ addedAt: -1 }).lean();
    res.json({ count: hotels.length, hotels });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/track/:id  (admin) ────────────────────────────────────────────
app.delete('/api/track/:id', adminAuth, async (req, res) => {
  try {
    const doc = await TrackingRequest.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ error: `No entry found with id '${req.params.id}'.` });
    console.log(`[REMOVED] id: ${req.params.id}`);
    res.json({ message: 'Tracking removed successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/scrape  (admin) ─────────────────────────────────────────────────
app.post('/api/scrape', adminAuth, (_req, res) => {
  res.json({ message: 'Scrape job triggered. Check server logs.' });
  runScrapeJob().catch((err) => console.error('[Scraper] Manual run failed:', err.message));
});

// ── GET /admin  (admin) ───────────────────────────────────────────────────────
app.use('/admin', adminAuth);
app.get('/admin', async (_req, res) => {
  try {
    const rows = await TrackingRequest.find().sort({ addedAt: -1 }).lean();
    res.send(renderAdminPage(rows));
  } catch (err) {
    res.status(500).send(`<pre>${err.message}</pre>`);
  }
});

// ── GET /health  (public) ─────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status:    'ok',
    db:        mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
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
  console.log(`  POST   /api/track     — public`);
  console.log(`  GET    /api/track     — admin`);
  console.log(`  DELETE /api/track/:id — admin`);
  console.log(`  POST   /api/scrape    — admin`);
  console.log(`  GET    /admin         — admin`);
  console.log(`  GET    /health        — public`);
  console.log(`\nAdmin   : ${process.env.ADMIN_USERNAME    ? '✓ ' + process.env.ADMIN_USERNAME : '✗ ADMIN_USERNAME not set'}`);
  console.log(`Email   : ${process.env.EMAIL_USER         ? '✓ ' + process.env.EMAIL_USER     : '✗ not set'}`);
  console.log(`Telegram: ${process.env.TELEGRAM_BOT_TOKEN ? '✓ configured'                   : '✗ not set'}`);
  console.log(`MongoDB : ${MONGODB_URI                    ? '✓ URI present'                  : '✗ not set'}\n`);
});

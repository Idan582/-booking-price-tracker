'use strict';

/**
 * scraper.js — Playwright price checker + Email / Telegram alerter.
 *
 * Called by the node-cron job in server.js every 2 hours.
 * For each entry in tracked_hotels.json it:
 *   1. Launches a headless Chromium browser.
 *   2. Navigates to the Booking.com URL.
 *   3. Finds the exact roomPackage string using the same DOM logic as content.js.
 *   4. Extracts the current price and compares it with targetPrice.
 *   5. Sends an Email alert (nodemailer/Gmail) and/or a Telegram message if the price dropped.
 *
 * NOTE: Playwright runs without the user's session cookies. Booking.com may show
 * slightly different prices to anonymous vs. logged-in users. Ensure the tracked
 * URL includes all relevant search parameters (checkin, checkout, adults, etc.).
 */

require('dotenv').config();

const { chromium } = require('playwright');
const nodemailer   = require('nodemailer');
const { Telegraf } = require('telegraf');
const fs           = require('fs');
const path         = require('path');

const DATA_FILE = path.join(__dirname, 'tracked_hotels.json');

// ── Helpers ──────────────────────────────────────────────────────────────────

function hotelNameFromUrl(url) {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    // pathname: /hotel/<country>/<slug>.he.html  →  parts[2] = slug
    const slug = (parts[2] || '').replace(/\.[^.]+\.[^.]+$/, '');
    return slug
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ') || 'המלון';
  } catch {
    return 'המלון';
  }
}

// ── Email alert (Gmail SMTP) ─────────────────────────────────────────────────

async function sendEmailAlert({ to, roomPackage, currentPrice, targetPrice, url, hotelName, alertCount }) {
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;

  if (!user || !pass) {
    console.error('[Email] Missing EMAIL_USER / EMAIL_PASS in .env — alert skipped.');
    return;
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });

  const isRepeat  = alertCount > 0;
  const subject   = isRepeat
    ? `🔥 ירידת מחיר נוספת! המחיר ממשיך לצנוח - ${hotelName} 📢`
    : `עדכון לגבי המעקב שלך בבוקינג - ${hotelName}`;
  const newPrice  = Math.round(currentPrice).toLocaleString('he-IL');
  const tgtPrice  = Math.round(targetPrice).toLocaleString('he-IL');
  const headerTxt = isRepeat ? '🔥 ירידת מחיר נוספת!' : '🔔 ירידת מחיר!';
  const headerBg  = isRepeat ? '#b71c1c' : '#003580';

  const repeatBanner = isRepeat ? `
            <table cellpadding="0" cellspacing="0" style="width:100%;background:#fff3e0;border-radius:8px;margin-bottom:20px;border:1px solid #ffcc80;">
              <tr>
                <td style="padding:14px 18px;">
                  <p style="margin:0;font-size:14px;font-weight:600;color:#e65100;">📢 המחיר ירד שוב מאז ההתראה האחרונה!</p>
                  <p style="margin:6px 0 0;font-size:13px;color:#bf360c;">זו הזדמנות לחסוך אפילו יותר כסף — המחיר ממשיך לצנוח. כדאי להזמין עכשיו לפני שהמחיר יעלה חזרה.</p>
                </td>
              </tr>
            </table>` : '';

  const html = `
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f6fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;direction:rtl;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb;padding:32px 0;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr>
          <td style="background:${headerBg};padding:24px 32px;">
            <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;">${headerTxt}</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:28px 32px;">
            ${repeatBanner}
            <p style="margin:0 0 6px;font-size:15px;color:#555;">חדר / חבילה:</p>
            <p style="margin:0 0 20px;font-size:16px;font-weight:600;color:#1a1a1a;">${roomPackage}</p>

            <table cellpadding="0" cellspacing="0" style="width:100%;background:#f0f4ff;border-radius:8px;margin-bottom:24px;">
              <tr>
                <td style="padding:16px 20px;text-align:center;border-left:1px solid #d9e3f7;">
                  <p style="margin:0 0 4px;font-size:12px;color:#777;">מחיר נוכחי</p>
                  <p style="margin:0;font-size:26px;font-weight:700;color:#003580;">₪${newPrice}</p>
                </td>
                <td style="padding:16px 20px;text-align:center;">
                  <p style="margin:0 0 4px;font-size:12px;color:#777;">יעד שלך</p>
                  <p style="margin:0;font-size:26px;font-weight:700;color:#2e7d32;">₪${tgtPrice}</p>
                </td>
              </tr>
            </table>

            <table cellpadding="0" cellspacing="0" style="width:100%;">
              <tr><td align="center">
                <a href="${url}" style="display:inline-block;background:#003580;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:13px 32px;border-radius:6px;">הזמן עכשיו &rarr;</a>
              </td></tr>
            </table>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:16px 32px;background:#f9fafb;border-top:1px solid #eee;">
            <p style="margin:0;font-size:11px;color:#aaa;text-align:center;">Booking Price Tracker &bull; התראה אוטומטית</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const info = await transporter.sendMail({ from: `Booking Price Tracker <${user}>`, to, subject, html });
  console.log(`[Email] ✓ Sent → ${to} (${info.messageId})`);
}

// ── Telegram alert ───────────────────────────────────────────────────────────

async function sendTelegramAlert({ roomPackage, currentPrice, targetPrice, url, chatId }) {
  const token          = process.env.TELEGRAM_BOT_TOKEN;
  const resolvedChatId = chatId || process.env.TELEGRAM_CHAT_ID;

  if (!token) {
    console.error('[Telegram] Missing TELEGRAM_BOT_TOKEN in .env — alert skipped.');
    return;
  }
  if (!resolvedChatId) {
    console.error('[Telegram] No Chat ID for this entry and TELEGRAM_CHAT_ID not set in .env — alert skipped.');
    return;
  }

  const bot  = new Telegraf(token);
  const text =
    `🔔 מעקב מחיר: "${roomPackage}" ירד ל-₪${Math.round(currentPrice)} ` +
    `(יעד שלך: ₪${Math.round(targetPrice)}).\n\nהזמן עכשיו: ${url}`;

  console.log('Sending Telegram alert to ID: ' + resolvedChatId);
  await bot.telegram.sendMessage(resolvedChatId, text);
  console.log(`[Telegram] ✓ Sent → chat ${resolvedChatId}`);
}

// ── Price extraction — runs INSIDE the Playwright browser context ────────────
//
// This function is serialised and sent to the page via page.evaluate().
// It MUST be fully self-contained — no references to the outer Node.js scope.
// The logic mirrors content.js's package-building and price-extraction exactly
// so the package strings match what was saved when the user clicked the button.

function extractPriceInPage(targetPkg) {
  function clean(el) {
    return el ? el.textContent.replace(/\s+/g, ' ').trim() : '';
  }

  function parseNum(el) {
    if (!el) return null;
    var raw = el.textContent.replace(/[^\d.,]/g, '').replace(/,/g, '');
    var n   = parseFloat(raw);
    return (isNaN(n) || n <= 0) ? null : n;
  }

  function buildPkg(roomName, condEls) {
    var name  = roomName.trim();
    var parts = [name];
    condEls.forEach(function (el) {
      var t = clean(el);
      if (t && t !== name && parts.indexOf(t) === -1 && t.length <= 120) parts.push(t);
    });
    return parts.join(' - ');
  }

  var PRICE_SELS = [
    '[data-testid="price-and-discounted-price"]',
    '[data-testid="recommended-units-price"]',
    '[data-testid="price-for-x-nights"]',
    '.hprt-price-price',
    '.bui-price-display__value',
    '[class*="finalPrice"]',
    '[class*="prco-inline"]',
  ].join(',');

  var COND_SELS = [
    '[data-testid="cancellation-policy-text"]',
    '[data-testid*="cancel"]',
    '[data-testid="meal-plan-text"]',
    '[data-testid*="meal"]',
    '.hprt-meal-type',
    '.meal-type-content',
    '.hprt-free-cancellation',
    '.hprt-non-refundable',
    '[class*="cancellation"]',
    '[class*="mealPlan"]',
    '[class*="meal-plan"]',
    '.hprt-conditions li',
  ].join(',');

  // ── Strategy 1: Classic hprt table ────────────────────────────────────────
  var table = document.querySelector(
    'table.hprt-table, #hprt-table, [data-selenium="hotel-availability-table"]'
  );

  if (table) {
    var currentName = '';
    var rows = table.querySelectorAll('tbody tr');
    for (var i = 0; i < rows.length; i++) {
      var row    = rows[i];
      var nameEl = row.querySelector(
        '.hprt-roomtype-link, [data-selenium="roomName"] a, ' +
        '.hprt-roomtype-name, [data-testid="roomtype-name"]'
      );
      if (nameEl) currentName = clean(nameEl);
      if (!currentName) continue;

      var hasCta = row.querySelector(
        '.hprt-booking-cta, [data-selenium="cta-button-element"], ' +
        '[data-testid="submit-button"], button[data-testid]'
      );
      if (!hasCta) continue;

      var condEls = Array.from(row.querySelectorAll(COND_SELS));
      if (buildPkg(currentName, condEls) === targetPkg) {
        return parseNum(row.querySelector(PRICE_SELS));
      }
    }
  }

  // ── Strategy 2: Modern React room-type blocks ──────────────────────────────
  var roomBlocks = document.querySelectorAll(
    '[data-testid="rt-roomtype-block"], [data-testid="hprt-roomtype-block"], ' +
    '[data-testid="room-type-block"], [data-testid="roomtype-block"]'
  );

  for (var b = 0; b < roomBlocks.length; b++) {
    var block    = roomBlocks[b];
    var rNameEl  = block.querySelector(
      '[data-testid="roomtype-name"], [data-testid="room-type-name"], ' +
      '[data-testid="rt-roomtype-name"], [data-testid="room-name"], .hprt-roomtype-link'
    );
    if (!rNameEl) continue;
    var roomName = clean(rNameEl);

    var offers  = block.querySelectorAll(
      '[data-testid="rt-offer-block"], [data-testid="offer-list-item"], ' +
      '[data-testid="offer-block"], .hprt-roomtype-offer'
    );
    var targets = offers.length > 0 ? Array.from(offers) : [block];

    for (var o = 0; o < targets.length; o++) {
      var offer   = targets[o];
      var condEls = Array.from(offer.querySelectorAll(COND_SELS));
      if (buildPkg(roomName, condEls) === targetPkg) {
        return parseNum(offer.querySelector(PRICE_SELS));
      }
    }
  }

  return null; // package not found on page
}

// ── Main scrape job ──────────────────────────────────────────────────────────

async function runScrapeJob() {
  console.log(`\n[Scraper] ─── Price check started at ${new Date().toISOString()} ───`);

  if (!fs.existsSync(DATA_FILE)) {
    console.log('[Scraper] tracked_hotels.json not found — nothing to check.');
    return;
  }

  let hotels;
  try {
    hotels = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  } catch (err) {
    console.error('[Scraper] Failed to parse tracked_hotels.json:', err.message);
    return;
  }

  if (!Array.isArray(hotels) || hotels.length === 0) {
    console.log('[Scraper] No tracked hotels — nothing to check.');
    return;
  }

  console.log(`[Scraper] ${hotels.length} hotel package(s) to check.`);

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    for (const hotel of hotels) {
      console.log(`\n[Scraper] ↳ "${hotel.roomPackage}"`);

      // Fresh isolated browser context per hotel — no cookie bleed between requests
      const context = await browser.newContext({
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
          'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        locale: 'he-IL',
        extraHTTPHeaders: { 'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8' },
        viewport: { width: 1280, height: 900 },
      });
      const page = await context.newPage();

      try {
        await page.goto(hotel.url, { waitUntil: 'domcontentloaded', timeout: 45000 });

        // Wait for the availability table or React blocks — whichever loads first
        await Promise.race([
          page.waitForSelector(
            'table.hprt-table, #hprt-table, [data-selenium="hotel-availability-table"]',
            { timeout: 20000 }
          ),
          page.waitForSelector('[data-testid="rt-roomtype-block"]', { timeout: 20000 }),
        ]).catch(() => {
          console.warn('[Scraper]   ⚠ Timed out waiting for room table — page may not have loaded.');
        });

        // Allow React to finish hydrating lazy-loaded prices
        await page.waitForTimeout(3000);

        const currentPrice = await page.evaluate(extractPriceInPage, hotel.roomPackage);

        if (currentPrice === null) {
          console.warn('[Scraper]   ⚠ Package not found on page (layout may have changed).');
          continue;
        }

        console.log(`[Scraper]   Current: ₪${currentPrice}  |  Target: ₪${hotel.targetPrice}`);

        if (currentPrice < hotel.targetPrice) {
          const alertCount = hotel.alertCount || 0;
          console.log(`[Scraper]   🔔 PRICE DROP (alert #${alertCount + 1}) — sending alerts...`);

          if (hotel.email) {
            await sendEmailAlert({
              to:           hotel.email,
              roomPackage:  hotel.roomPackage,
              currentPrice: currentPrice,
              targetPrice:  hotel.targetPrice,
              url:          hotel.url,
              hotelName:    hotelNameFromUrl(hotel.url),
              alertCount:   alertCount,
            }).catch((err) => console.error('[Scraper]   Email error:', err.message));
          }

          if (hotel.telegram) {
            await sendTelegramAlert({
              roomPackage:  hotel.roomPackage,
              currentPrice: currentPrice,
              targetPrice:  hotel.targetPrice,
              url:          hotel.url,
              chatId:       hotel.telegramChatId || null,
            }).catch((err) => console.error('[Scraper]   Telegram error:', err.message));
          }

          if (!hotel.email && !hotel.telegram) {
            console.warn('[Scraper]   No notification channel configured — alert skipped.');
          }

          // Advance targetPrice and increment alertCount so the next run only
          // alerts on a further drop, and subsequent emails use the repeat subject.
          hotel.targetPrice = currentPrice;
          hotel.alertCount  = alertCount + 1;
          try {
            fs.writeFileSync(DATA_FILE, JSON.stringify(hotels, null, 2), 'utf-8');
            console.log(`[Scraper]   ✓ targetPrice → ₪${currentPrice}, alertCount → ${hotel.alertCount} saved.`);
          } catch (writeErr) {
            console.error('[Scraper]   Failed to save updated fields:', writeErr.message);
          }
        } else {
          const gap = currentPrice - hotel.targetPrice;
          console.log(`[Scraper]   ✓ No drop (₪${gap} above target). Continuing to monitor.`);
        }
      } catch (err) {
        console.error('[Scraper]   Error:', err.message);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }

  console.log('\n[Scraper] ─── Price check complete ───\n');
}

module.exports = { runScrapeJob };

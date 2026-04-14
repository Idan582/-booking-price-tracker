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

const { chromium }    = require('playwright');
const nodemailer      = require('nodemailer');
const mongoose        = require('mongoose');
const TrackingRequest = require('./models/TrackingRequest');

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
  const user     = process.env.EMAIL_USER;
  const pass     = process.env.EMAIL_PASS;
  const fromAddr = process.env.EMAIL_FROM || user;

  if (!user || !pass) {
    console.error('[Email] Missing EMAIL_USER / EMAIL_PASS in .env — alert skipped.');
    return;
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });

  const isRepeat = alertCount > 0;
  const subject  = isRepeat
    ? `🚨 ירידת מחיר נוספת! המחיר ממשיך לצנוח למלון ${hotelName}`
    : `⚠️ התראת מחיר: ירידת מחיר למלון ${hotelName}`;

  const newPrice = Math.round(currentPrice).toLocaleString('he-IL');
  const tgtPrice = Math.round(targetPrice).toLocaleString('he-IL');
  const savings  = Math.round(targetPrice - currentPrice).toLocaleString('he-IL');

  // Alert badge — doubles as the double-drop indicator (replaces separate repeatBanner)
  const alertBadge = isRepeat
    ? `<table cellpadding="0" cellspacing="0" style="width:100%;background:#fce4ec;border-radius:8px;margin-bottom:28px;border:1px solid #ef9a9a;">
              <tr><td style="padding:14px 20px;">
                <p style="margin:0;font-size:14px;font-weight:700;color:#b71c1c;">🚨 ירידת מחיר נוספת זוהתה!</p>
                <p style="margin:6px 0 0;font-size:13px;color:#c62828;">המחיר ירד שוב מאז ההתראה האחרונה — זו הזדמנות לחסוך אפילו יותר. מומלץ לפעול לפני שהמחיר יעלה.</p>
              </td></tr>
            </table>`
    : `<table cellpadding="0" cellspacing="0" style="width:100%;background:#fff8e1;border-radius:8px;margin-bottom:28px;border:1px solid #ffe082;">
              <tr><td style="padding:14px 20px;">
                <p style="margin:0;font-size:14px;font-weight:700;color:#f57c00;">⚠️ ירידת מחיר זוהתה</p>
                <p style="margin:6px 0 0;font-size:13px;color:#e65100;">המחיר ירד מתחת ליעד שהגדרת. לחץ על הכפתור למטה כדי לנצל את ההזדמנות.</p>
              </td></tr>
            </table>`;

  const html = `
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>התראת מחיר</title>
</head>
<body style="margin:0;padding:0;background:#f0f2f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;direction:rtl;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f5;padding:40px 16px;">
    <tr><td align="center">
      <table width="580" cellpadding="0" cellspacing="0" style="max-width:580px;width:100%;">

        <!-- Brand bar -->
        <tr>
          <td style="background:#003580;padding:13px 32px;border-radius:10px 10px 0 0;">
            <p style="margin:0;font-size:11px;font-weight:600;color:rgba(255,255,255,0.8);letter-spacing:1.2px;">BOOKING PRICE TRACKER</p>
          </td>
        </tr>

        <!-- White card -->
        <tr>
          <td style="background:#ffffff;padding:36px 40px;border-radius:0 0 10px 10px;box-shadow:0 4px 24px rgba(0,0,0,0.09);">

            <!-- Alert badge -->
            ${alertBadge}

            <!-- Hotel name & room package -->
            <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#999;letter-spacing:0.6px;">מלון</p>
            <p style="margin:0 0 12px;font-size:22px;font-weight:700;color:#0d1b2a;line-height:1.25;">${hotelName}</p>
            <table cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
              <tr>
                <td style="background:#f0f4ff;border-radius:6px;padding:8px 14px;">
                  <p style="margin:0;font-size:13px;color:#3a3a5c;line-height:1.5;">${roomPackage}</p>
                </td>
              </tr>
            </table>

            <!-- Price comparison box -->
            <table cellpadding="0" cellspacing="0" style="width:100%;background:#f8faf8;border-radius:12px;border:1px solid #deeade;margin-bottom:28px;">
              <tr>
                <td style="padding:30px 32px;">

                  <!-- Old price -->
                  <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#999;">המחיר המקורי:</p>
                  <p style="margin:0 0 22px;font-size:22px;font-weight:600;color:#bbb;"><del>&#8362;${tgtPrice}</del></p>

                  <!-- Divider -->
                  <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:22px;">
                    <tr><td style="border-top:1px solid #e0ede0;font-size:0;line-height:0;">&nbsp;</td></tr>
                  </table>

                  <!-- New price -->
                  <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#2e7d32;">המחיר החדש:</p>
                  <p style="margin:0 0 20px;font-size:52px;font-weight:700;color:#1b5e20;line-height:1;">&#8362;${newPrice}</p>

                  <!-- Savings badge -->
                  <table cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="background:#e8f5e9;border:1px solid #c8e6c9;border-radius:20px;padding:7px 18px;">
                        <p style="margin:0;font-size:13px;font-weight:700;color:#2e7d32;">✓&nbsp; חיסכון של &#8362;${savings}!</p>
                      </td>
                    </tr>
                  </table>

                </td>
              </tr>
            </table>

            <!-- CTA button -->
            <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:28px;">
              <tr><td>
                <a href="${url}" style="display:block;background:#003580;color:#ffffff;text-decoration:none;font-size:17px;font-weight:700;padding:18px 32px;border-radius:10px;text-align:center;letter-spacing:0.3px;">להזמנה בבוקינג &rarr;</a>
              </td></tr>
            </table>

            <!-- Footer disclaimer -->
            <p style="margin:0;font-size:12px;color:#aaa;text-align:center;line-height:1.7;">שים לב: המחירים בבוקינג משתנים בתדירות גבוהה.<br>אנו ממליצים לבדוק את ההצעה בהקדם האפשרי.</p>

          </td>
        </tr>

        <!-- Bottom caption -->
        <tr>
          <td style="padding:18px 0;text-align:center;">
            <p style="margin:0;font-size:11px;color:#bbb;">Booking Price Tracker &bull; התראה אוטומטית</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const userEmail = to;
  const info = await transporter.sendMail({ from: `Booking Price Tracker <${fromAddr}>`, to: userEmail, subject, html });
  console.log("Email sent to: " + userEmail);
  console.log(`[Email] ✓ Sent → ${userEmail} (${info.messageId})`);
}

// ── Price extraction — runs INSIDE the Playwright browser context ────────────
//
// This function is serialised and sent to the page via page.evaluate().
// It MUST be fully self-contained — no references to the outer Node.js scope.
//
// Strategy: collect ALL visible prices on the page and return the lowest one.
// We do NOT match by room/package name — any available price for the given
// dates is valid; the user wants the cheapest option.

function extractPriceInPage() {
  function parseNum(el) {
    if (!el) return null;
    var raw = el.textContent.replace(/[^\d.,]/g, '').replace(/,/g, '');
    var n   = parseFloat(raw);
    return (isNaN(n) || n <= 0 || n > 100000) ? null : n;
  }

  var PRICE_SELS = [
    // 2024-2025 data-testid variants
    '[data-testid="price-and-discounted-price"]',
    '[data-testid="recommended-units-price"]',
    '[data-testid="price-for-x-nights"]',
    '[data-testid="price-and-possession"]',
    '[data-testid="price"]',
    // Classic table classes
    '.hprt-price-price',
    '.bui-price-display__value',
    '.prco-valign-middle-helper',
    '.prco-text-nowrap-helper',
    // Generic class fragments
    '[class*="finalPrice"]',
    '[class*="prco-inline"]',
    '[class*="priceValue"]',
    '[class*="price-value"]',
    '[class*="ugiat"]',
    // Currency element wrappers
    '[data-et-click*="price"]',
  ].join(',');

  var allPrices = [];

  // ── Strategy 1: CSS price selectors ──────────────────────────────────────
  var priceEls = Array.from(document.querySelectorAll(PRICE_SELS));
  priceEls.forEach(function(el) {
    var n = parseNum(el);
    if (n !== null) allPrices.push(n);
  });

  // ── Strategy 2: Walk all leaf elements containing ₪ / ILS ────────────────
  if (allPrices.length === 0) {
    var allEls = Array.from(document.querySelectorAll('*'));
    for (var e = 0; e < allEls.length; e++) {
      var el = allEls[e];
      if (el.children.length > 5) continue;
      var txt = el.textContent || '';
      if (txt.indexOf('₪') === -1 && txt.indexOf('ILS') === -1) continue;
      var raw = txt.replace(/[^\d.,]/g, '').replace(/,/g, '');
      var n   = parseFloat(raw);
      if (!isNaN(n) && n > 0 && n < 100000) allPrices.push(n);
    }
  }

  if (allPrices.length === 0) return null;

  // Return the lowest price found (cheapest available room)
  allPrices.sort(function(a, b) { return a - b; });
  return allPrices[0];
}

// ── Per-hotel scrape logic (shared by cron job and immediate trigger) ─────────

async function scrapeOneHotel(hotel, browser) {
  console.log(`\n[Scraper] ↳ ${hotel.url}`);

  // Use the original URL exactly as provided — no language override
  const scrapeUrl = hotel.url;

  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
      'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.207 Safari/537.36',
    extraHTTPHeaders: {
      'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Upgrade-Insecure-Requests': '1',
    },
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();

  try {
    await page.goto(scrapeUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });

    // Log page title — tells us immediately if we hit a captcha / security screen
    const pageTitle = await page.title();
    console.log("--- Page Title: " + pageTitle);

    // Wait for the room table or React blocks
    await Promise.race([
      page.waitForSelector(
        'table.hprt-table, #hprt-table, [data-selenium="hotel-availability-table"]',
        { timeout: 20000 }
      ),
      page.waitForSelector('[data-testid="rt-roomtype-block"]', { timeout: 20000 }),
    ]).catch(() => {
      console.warn('[Scraper]   ⚠ Timed out waiting for room table — page may not have loaded.');
    });

    // Wait for at least one price element to become visible
    await page.waitForSelector(
      '.hprt-price-price, .prco-valign-middle-helper, ' +
      '[data-testid="price-and-discounted-price"], [data-testid="price-and-possession"], ' +
      '[data-testid="recommended-units-price"], .bui-price-display__value',
      { state: 'visible', timeout: 15000 }
    ).catch(() => {
      console.warn('[Scraper]   ⚠ Timed out waiting for a visible price element.');
    });

    // 10-second wait for full React hydration
    await page.waitForTimeout(10000);

    // ── CSS-selector strategy: collect all prices, pick the lowest ───────────
    let currentPrice = await page.evaluate(extractPriceInPage);

    // ── Regex / deep-search fallback ─────────────────────────────────────────
    if (currentPrice === null) {
      console.warn('[Scraper]   ⚠ CSS strategies failed — trying regex deep search...');

      const pageText = await page.evaluate(() => document.body.innerText);

      // Find all prices expressed as ₪1,234 or 1,234 ₪ (English layout uses £/€/$ but
      // the stored price is in ILS so we also accept raw numbers near "ILS" or "Total")
      const patterns = [
        /₪\s*([\d,]+)/g,
        /([\d,]+)\s*₪/g,
        /ILS\s*([\d,]+)/g,
        /([\d,]+)\s*ILS/g,
      ];

      const allPrices = [];
      for (const re of patterns) {
        let m;
        re.lastIndex = 0;
        while ((m = re.exec(pageText)) !== null) {
          const n = parseFloat(m[1].replace(/,/g, ''));
          if (!isNaN(n) && n > 0 && n < 100000) allPrices.push(n);
        }
      }

      if (allPrices.length > 0) {
        // Prefer a price near "Total" / סה"כ in the page text
        const totalMatch = pageText.match(/(?:Total|סה[""׳]כ)[^\d]*?([\d,]+)/i);
        if (totalMatch) {
          const n = parseFloat(totalMatch[1].replace(/,/g, ''));
          if (!isNaN(n) && n > 0 && n < 100000) {
            currentPrice = n;
            console.log('[Scraper]   ✓ Price found via Total/סה"כ regex: ' + currentPrice);
          }
        }
        // Fallback: take the smallest plausible price (room rate, not grand total)
        if (currentPrice === null) {
          allPrices.sort((a, b) => a - b);
          currentPrice = allPrices[0];
          console.log('[Scraper]   ✓ Price found via regex scan (lowest): ' + currentPrice);
        }
      }
    }

    if (currentPrice === null) {
      const pageContent = await page.content();
      console.log("--- HTML Content Preview: " + pageContent.substring(0, 500));
      console.warn('[Scraper]   ⚠ Package not found on page (layout may have changed).');
      return;
    }

    console.log("--- Price found: " + currentPrice);
    console.log(`[Scraper]   Current: ₪${currentPrice}  |  Target: ₪${hotel.targetPrice}`);

    if (currentPrice < hotel.targetPrice) {
      const alertCount = hotel.alertCount || 0;
      console.log(`[Scraper]   🔔 PRICE DROP (alert #${alertCount + 1}) — sending alerts...`);

      if (hotel.email) {
        const userEmail = hotel.email;
        console.log("--- Attempting to send email to: " + userEmail);
        await sendEmailAlert({
          to:           userEmail,
          roomPackage:  hotel.roomPackage,
          currentPrice: currentPrice,
          targetPrice:  hotel.targetPrice,
          url:          hotel.url,
          hotelName:    hotelNameFromUrl(hotel.url),
          alertCount:   alertCount,
        }).catch((error) => {
          console.log("--- Mailer Error: ", error);
          console.error('[Scraper]   Email error:', error.message);
        });
      }

      if (!hotel.email) {
        console.warn('[Scraper]   No notification channel configured — alert skipped.');
      }

      try {
        await TrackingRequest.findByIdAndUpdate(hotel._id, {
          $set: { targetPrice: currentPrice },
          $inc: { alertCount: 1 },
        });
        console.log(`[Scraper]   ✓ targetPrice → ₪${currentPrice}, alertCount → ${alertCount + 1} saved.`);
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

// ── Immediate single-hotel scrape (called on POST /api/track) ─────────────────

async function runScrapeForDoc(doc) {
  const hotelUrl = doc.url;
  console.log("Immediate scrape triggered for: " + hotelUrl);
  console.log("--- Starting Scrape for: " + hotelUrl);

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    await scrapeOneHotel(doc, browser);
  } finally {
    await browser.close();
  }
}

// ── Main scrape job (cron — checks all tracked hotels) ───────────────────────

async function runScrapeJob() {
  console.log(`\n[Scraper] ─── Price check started at ${new Date().toISOString()} ───`);

  if (mongoose.connection.readyState !== 1) {
    console.warn('[Scraper] MongoDB not connected — skipping run.');
    return;
  }

  let hotels;
  try {
    hotels = await TrackingRequest.find().lean();
  } catch (err) {
    console.error('[Scraper] Failed to load tracked hotels from DB:', err.message);
    return;
  }

  if (!hotels.length) {
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
      await scrapeOneHotel(hotel, browser);
    }
  } finally {
    await browser.close();
  }

  console.log('\n[Scraper] ─── Price check complete ───\n');
}

module.exports = { runScrapeJob, runScrapeForDoc };

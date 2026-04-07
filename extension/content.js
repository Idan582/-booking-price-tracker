/**
 * Booking.com Price Tracker — content script
 *
 * Injection strategy (bottom-up, layout-agnostic):
 *   1. Find every price element on the page.
 *   2. Walk UP the DOM from each price to find the nearest ancestor that
 *      also contains a CTA/reserve button.
 *   3. Inject our button next to that CTA button.
 *   4. Fallback: scan for CTA buttons directly and inject next to each.
 *
 * This approach is language-independent — it doesn't rely on knowing the
 * table structure ahead of time, so it works regardless of locale or layout.
 *
 * MutationObserver (debounced 700ms) re-runs injection after React re-renders.
 */
(function () {
  'use strict';

  const BACKEND_URL = 'http://localhost:3001/api/track';

  // ── Styles ──────────────────────────────────────────────────────────────────

  function injectStyles() {
    if (document.getElementById('bpt-styles')) return;
    const s = document.createElement('style');
    s.id = 'bpt-styles';
    s.textContent = `
      .bpt-track-btn {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        margin-top: 8px;
        padding: 6px 12px;
        background: #003580;
        color: #fff !important;
        border: none;
        border-radius: 4px;
        font-size: 12px;
        font-family: inherit;
        font-weight: 600;
        cursor: pointer;
        white-space: nowrap;
        line-height: 1.4;
        transition: background 0.15s;
        text-decoration: none !important;
      }
      .bpt-track-btn:hover  { background: #00224f; }
      .bpt-track-btn:active { background: #001433; }

      #bpt-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.55);
        z-index: 2147483646;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      #bpt-modal {
        background: #fff;
        border-radius: 10px;
        padding: 28px 30px 24px;
        width: 390px;
        max-width: calc(100vw - 32px);
        box-shadow: 0 12px 50px rgba(0,0,0,0.28);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        position: relative;
        z-index: 2147483647;
        direction: rtl;
        text-align: right;
      }
      #bpt-modal h2 {
        margin: 0 0 4px;
        font-size: 17px;
        font-weight: 700;
        color: #003580;
      }
      #bpt-modal .bpt-pkg {
        font-size: 11px;
        color: #888;
        margin-bottom: 14px;
        line-height: 1.5;
        word-break: break-word;
      }
      #bpt-modal .bpt-price {
        font-size: 23px;
        font-weight: 700;
        color: #1a1a1a;
        margin-bottom: 18px;
      }
      #bpt-modal .bpt-q {
        font-size: 14px;
        font-weight: 600;
        color: #333;
        margin-bottom: 10px;
      }
      #bpt-modal .bpt-opts { display: flex; flex-direction: column; gap: 8px; }
      #bpt-modal .bpt-opt {
        padding: 10px 14px;
        border: 2px solid #003580;
        border-radius: 6px;
        background: #fff;
        color: #003580;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        text-align: right;
        font-family: inherit;
        transition: background 0.15s, color 0.15s;
      }
      #bpt-modal .bpt-opt:hover    { background: #003580; color: #fff; }
      #bpt-modal .bpt-opt:disabled { opacity: 0.5; cursor: not-allowed; }
      #bpt-modal .bpt-x {
        position: absolute;
        top: 12px;
        left: 14px;
        background: none;
        border: none;
        font-size: 22px;
        line-height: 1;
        color: #aaa;
        cursor: pointer;
        padding: 0;
      }
      #bpt-modal .bpt-x:hover { color: #333; }
      #bpt-modal .bpt-subtitle {
        font-size: 13px;
        color: #555;
        line-height: 1.55;
        margin-bottom: 16px;
      }
      .bpt-hidden { display: none !important; }
      #bpt-modal .bpt-notif-opts { margin-bottom: 14px; }
      #bpt-modal .bpt-notif-label {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
        font-weight: 600;
        color: #333;
        cursor: pointer;
        padding: 5px 0;
        user-select: none;
      }
      #bpt-modal .bpt-notif-label input[type="checkbox"] { cursor: pointer; width: 15px; height: 15px; }
      #bpt-modal #bpt-email-wrap,
      #bpt-modal #bpt-tg-wrap { padding: 4px 0 8px 23px; }
      #bpt-modal .bpt-tg-link {
        display: inline-block;
        color: #0088cc;
        font-size: 13px;
        font-weight: 600;
        text-decoration: none;
        padding: 6px 12px;
        border: 1.5px solid #0088cc;
        border-radius: 6px;
        transition: background 0.15s, color 0.15s;
      }
      #bpt-modal .bpt-tg-link:hover { background: #0088cc; color: #fff !important; }
      #bpt-modal .bpt-tg-id-row { margin-top: 8px; }
      #bpt-modal .bpt-help-link {
        display: inline-block;
        margin-top: 5px;
        font-size: 11.5px;
        color: #0055aa;
        text-decoration: underline;
        cursor: pointer;
        background: none;
        border: none;
        padding: 0;
        font-family: inherit;
      }
      #bpt-modal .bpt-help-link:hover { color: #003580; }
      #bpt-modal .bpt-help-text {
        margin-top: 5px;
        font-size: 11.5px;
        color: #555;
        line-height: 1.5;
        background: #f0f4ff;
        border-radius: 5px;
        padding: 6px 9px;
      }
      #bpt-modal .bpt-phone-input {
        width: 100%;
        padding: 8px 10px;
        border: 1.5px solid #c2cfe0;
        border-radius: 6px;
        font-size: 14px;
        font-family: inherit;
        direction: ltr;
        text-align: left;
        box-sizing: border-box;
        outline: none;
        transition: border-color 0.15s;
        margin-bottom: 7px;
      }
      #bpt-modal .bpt-phone-input:focus { border-color: #003580; }
      #bpt-modal .bpt-save-label {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        color: #666;
        cursor: pointer;
        margin-bottom: 16px;
      }
      #bpt-modal .bpt-save-label input { cursor: pointer; }
      #bpt-modal .bpt-err {
        color: #c62828;
        font-size: 13px;
        margin-top: 10px;
      }
      #bpt-modal .bpt-ok {
        text-align: center;
        padding: 8px 0 4px;
      }
      #bpt-modal .bpt-ok .bpt-check { font-size: 52px; line-height: 1; margin-bottom: 12px; }
      #bpt-modal .bpt-ok p { margin: 0 0 18px; font-size: 14px; font-weight: 600; color: #2e7d32; line-height: 1.6; }
      #bpt-modal .bpt-ok .bpt-close-ok {
        padding: 9px 28px;
        background: #003580;
        color: #fff;
        border: none;
        border-radius: 6px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        font-family: inherit;
        transition: background 0.15s;
      }
      #bpt-modal .bpt-ok .bpt-close-ok:hover { background: #00224f; }
    `;
    document.head.appendChild(s);
  }

  // ── Utilities ────────────────────────────────────────────────────────────────

  function cleanText(el) {
    return el ? el.textContent.replace(/\s+/g, ' ').trim() : '';
  }

  function parsePrice(el) {
    if (!el) return null;
    // Strip everything except digits, comma, dot — then remove comma thousands separators
    const raw = el.textContent.replace(/[^\d.,]/g, '').replace(/,/g, '');
    const num  = parseFloat(raw);
    return isNaN(num) || num <= 0 ? null : num;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ── Room name extraction ─────────────────────────────────────────────────────
  // Walk UP from a container, searching for a room-name element at each level.

  const ROOM_NAME_SELS = [
    '.hprt-roomtype-link',
    '[data-testid="roomtype-name"]',
    '[data-testid="room-type-name"]',
    '[data-testid="rt-roomtype-name"]',
    '[data-testid="room-name"]',
    '[data-selenium="roomName"] a',
    '[class*="roomName"]',
    '[class*="RoomName"]',
    '[class*="room-name"]',
    '[class*="roomtype-name"]',
  ].join(',');

  function findRoomName(startEl) {
    let el = startEl;
    for (let i = 0; i < 14 && el; i++) {
      const hit = el.querySelector(ROOM_NAME_SELS);
      if (hit) return cleanText(hit);
      el = el.parentElement;
    }
    return null;
  }

  // ── Condition extraction ─────────────────────────────────────────────────────

  const COND_SELS = [
    '[data-testid="cancellation-policy-text"]',
    '[data-testid*="cancel"]',
    '[data-testid="meal-plan-text"]',
    '[data-testid*="meal"]',
    '[data-testid="offer-feature"]',
    '.hprt-meal-type',
    '.meal-type-content',
    '.hprt-free-cancellation',
    '.hprt-non-refundable',
    '[class*="cancellation"]',
    '[class*="mealPlan"]',
    '[class*="meal-plan"]',
    '.hprt-conditions li',
  ].join(',');

  function buildPackage(container, roomName) {
    const name  = (roomName || 'חדר').trim();
    const parts = [name];
    if (container) {
      container.querySelectorAll(COND_SELS).forEach(function (el) {
        const t = cleanText(el);
        if (t && t !== name && !parts.includes(t) && t.length <= 120) parts.push(t);
      });
    }
    return parts.join(' - ');
  }

  // ── Core injection ───────────────────────────────────────────────────────────
  //
  // Selectors for reserve/CTA buttons — data-testid attributes are stable across
  // all Booking.com locales (including Hebrew RTL UI).

  const CTA_SELS = [
    '[data-testid="reserve-button"]',
    '[data-testid="submit-button"]',
    '[data-testid="cta-button"]',
    '[data-selenium="cta-button-element"]',
    '.hprt-booking-cta a',
    '.hprt-booking-cta button',
    '.hprt-booking-cta',
    '.sr_cta_button',
    'button[data-testid*="reserve"]',
    'button[data-testid*="book"]',
    'a[data-testid*="reserve"]',
  ].join(',');

  // Selectors for price elements — tried in priority order.
  const PRICE_EL_SELS = [
    '[data-testid="price-and-discounted-price"]',
    '[data-testid="recommended-units-price"]',
    '[data-testid="price-for-x-nights"]',
    '.hprt-price-price',
    '.bui-price-display__value',
    '[class*="finalPrice"]',
    '[class*="prco-inline"]',
    '[class*="price-value"]',
  ];

  function injectButtons() {
    console.log('[Booking Tracker] Scanning for rooms...');
    let injected = 0;

    // ── Strategy 1: Classic hprt table ──────────────────────────────────────
    // Walk each <tbody tr> explicitly. Track the room name across rowspan groups.
    // Inject into the conditions or price cell — NEVER into .hprt-table-cell-roomtype.

    const table = document.querySelector(
      'table.hprt-table, #hprt-table, [data-selenium="hotel-availability-table"]'
    );

    if (table) {
      let currentRoomName = '';

      table.querySelectorAll('tbody tr').forEach(function (row) {
        // Room name appears only in the first row of each rowspan group
        const nameEl = row.querySelector(
          '.hprt-roomtype-link, [data-selenium="roomName"] a, ' +
          '.hprt-roomtype-name, [data-testid="roomtype-name"]'
        );
        if (nameEl) currentRoomName = cleanText(nameEl);
        if (!currentRoomName) return;

        // Offer rows always have a price — skip rows that don't
        let price = null;
        for (const sel of PRICE_EL_SELS) {
          const priceEl = row.querySelector(sel);
          if (priceEl) { price = parsePrice(priceEl); break; }
        }
        if (price === null) return;

        // Choose the injection cell in priority order.
        // The roomtype cell (.hprt-table-cell-roomtype) is explicitly excluded
        // because it spans multiple rows and is the description column, not an offer column.
        const target =
          row.querySelector('.hprt-table-cell-conditions') ||
          row.querySelector('[class*="hprt-conditions"]')  ||
          row.querySelector('.hprt-price')                 ||
          row.querySelector('[class*="hprt-price"]')       ||
          row.querySelector('.hprt-booking-cta');

        if (!target) return;
        if (target.classList.contains('hprt-table-cell-roomtype')) return;
        if (target.querySelector('.bpt-track-btn')) return;

        const pkg  = buildPackage(row, currentRoomName);
        const wrap = document.createElement('div');
        wrap.style.cssText = 'margin-top:8px;display:block;line-height:normal;';
        wrap.appendChild(makeButton(pkg, price));
        target.appendChild(wrap);
        injected++;
      });

      console.log('[Booking Tracker] Classic table — injected:', injected);
    }

    // ── Strategy 2: Modern React offer blocks ────────────────────────────────
    // Each [data-testid="rt-offer-block"] is one bookable package inside a room type.
    // Room name lives in the parent room-type block, not in the offer block itself.

    if (injected === 0) {
      const offerBlocks = document.querySelectorAll(
        '[data-testid="rt-offer-block"], [data-testid="offer-list-item"], ' +
        '[data-testid="offer-block"], .hprt-roomtype-offer'
      );

      console.log('[Booking Tracker] React offer blocks found:', offerBlocks.length);

      offerBlocks.forEach(function (offer) {
        if (offer.querySelector('.bpt-track-btn')) return;

        // Room name is in the parent room-type block, not inside the offer block
        const roomBlock = offer.closest(
          '[data-testid="rt-roomtype-block"], [data-testid="hprt-roomtype-block"], ' +
          '[data-testid="room-type-block"], [data-testid="roomtype-block"]'
        );
        const nameEl = roomBlock && roomBlock.querySelector(
          '[data-testid="roomtype-name"], [data-testid="room-type-name"], ' +
          '[data-testid="rt-roomtype-name"], [data-testid="room-name"], .hprt-roomtype-link'
        );
        const roomName = nameEl ? cleanText(nameEl) : 'חדר';

        let price = null;
        for (const sel of PRICE_EL_SELS) {
          const priceEl = offer.querySelector(sel);
          if (priceEl) { price = parsePrice(priceEl); break; }
        }

        const pkg         = buildPackage(offer, roomName);
        const submitBtn   = offer.querySelector('[data-testid="submit-button"], button[data-testid]');
        const anchor      = submitBtn ? (submitBtn.parentElement || offer) : offer;

        if (anchor.querySelector('.bpt-track-btn')) return;

        const wrap = document.createElement('div');
        wrap.style.cssText = 'margin-top:8px;display:block;line-height:normal;';
        wrap.appendChild(makeButton(pkg, price));
        anchor.appendChild(wrap);
        injected++;
      });

      console.log('[Booking Tracker] React blocks — injected:', injected);
    }

    // ── Strategy 3: CTA-button scan (last-resort fallback) ───────────────────
    // Walk from each CTA button up to the nearest ancestor that has a price.
    // Inject next to the CTA button; explicitly skip .hprt-table-cell-roomtype.

    if (injected === 0) {
      console.log('[Booking Tracker] CTA fallback scan...');

      Array.from(document.querySelectorAll(CTA_SELS))
        .filter(function (btn) {
          return !btn.classList.contains('bpt-track-btn') && !btn.getAttribute('data-bpt-done');
        })
        .forEach(function (ctaBtn) {
          ctaBtn.setAttribute('data-bpt-done', '1');

          // Walk up to find an ancestor that contains a price element
          let container = null;
          let price     = null;
          let el        = ctaBtn.parentElement;
          for (let i = 0; i < 12 && el; i++) {
            for (const sel of PRICE_EL_SELS) {
              const priceEl = el.querySelector(sel);
              if (priceEl) { container = el; price = parsePrice(priceEl); break; }
            }
            if (container) break;
            el = el.parentElement;
          }
          if (!container) return;

          // Anchor: the <td> or direct parent of the CTA button
          const anchor = ctaBtn.tagName === 'TD'
            ? ctaBtn
            : (ctaBtn.closest('td') || ctaBtn.parentElement);

          if (!anchor) return;
          if (anchor.classList.contains('hprt-table-cell-roomtype')) return; // explicit exclusion
          if (anchor.querySelector('.bpt-track-btn')) return;

          const roomName = findRoomName(container) || 'חדר';
          const pkg      = buildPackage(container, roomName);
          const wrap     = document.createElement('div');
          wrap.style.cssText = 'margin-top:8px;display:block;line-height:normal;';
          wrap.appendChild(makeButton(pkg, price));
          anchor.appendChild(wrap);
          injected++;
        });

      console.log('[Booking Tracker] CTA fallback — injected:', injected);
    }

    console.log('[Booking Tracker] Total injected:', injected);
  }

  // ── Button factory ───────────────────────────────────────────────────────────

  function makeButton(roomPackage, currentPrice) {
    const btn = document.createElement('button');
    btn.className = 'bpt-track-btn';
    btn.setAttribute('type', 'button');
    btn.textContent = '🔔 מעקב מחיר';
    btn.title = roomPackage;
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      e.preventDefault();
      showModal(roomPackage, currentPrice);
    });
    return btn;
  }

  // ── Modal ────────────────────────────────────────────────────────────────────

  var _bptSaveHandler = null; // capture-phase handler for the currently-open modal

  function closeModal() {
    const el = document.getElementById('bpt-backdrop');
    if (el) el.remove();
    if (_bptSaveHandler) {
      document.removeEventListener('click', _bptSaveHandler, true);
      _bptSaveHandler = null;
    }
  }

  const EMAIL_STORAGE_KEY  = 'bpt_email';
  const TG_ID_STORAGE_KEY  = 'bpt_tg_id';

  function showModal(roomPackage, currentPrice) {
    closeModal();

    const priceLabel = currentPrice !== null
      ? '₪' + currentPrice.toLocaleString('he-IL')
      : 'מחיר לא זוהה';

    // Pre-calculate threshold labels; fall back to '—' if price unknown
    const fmt = function (p) { return '₪' + Math.max(1, p).toLocaleString('he-IL'); };
    const price5  = currentPrice !== null ? fmt(Math.round(currentPrice * 0.95)) : '—';
    const price10 = currentPrice !== null ? fmt(Math.round(currentPrice * 0.90)) : '—';

    const savedEmail  = localStorage.getItem(EMAIL_STORAGE_KEY) || '';
    const savedTgId   = localStorage.getItem(TG_ID_STORAGE_KEY) || '';

    const backdrop = document.createElement('div');
    backdrop.id = 'bpt-backdrop';
    backdrop.addEventListener('click', function (e) {
      if (e.target === backdrop) closeModal();
    });

    const modal = document.createElement('div');
    modal.id = 'bpt-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML = `
      <button class="bpt-x" type="button" aria-label="סגור">×</button>
      <h2>🔔 מעקב מחיר</h2>
      <div class="bpt-pkg">${escapeHtml(roomPackage)}</div>
      <div class="bpt-price">מחיר נוכחי: ${escapeHtml(priceLabel)}</div>
      <div class="bpt-subtitle">אנחנו נבדוק את מחיר החדר הזה באופן אוטומטי ונשלח לך התראה כשהמחיר יצנח.</div>
      <div class="bpt-q">קבל התראה דרך:</div>
      <div class="bpt-notif-opts">
        <label class="bpt-notif-label">
          <input type="checkbox" id="bpt-ch-email" ${savedEmail ? 'checked' : ''} />
          <span>מייל</span>
        </label>
        <div id="bpt-email-wrap" class="${savedEmail ? '' : 'bpt-hidden'}">
          <input class="bpt-phone-input" id="bpt-email-input" type="email"
                 placeholder="your@email.com" autocomplete="email"
                 value="${escapeHtml(savedEmail)}" />
          <label class="bpt-save-label">
            <input type="checkbox" id="bpt-save-email" ${savedEmail ? 'checked' : ''} />
            <span>שמור מייל לפעם הבאה</span>
          </label>
        </div>
        <label class="bpt-notif-label">
          <input type="checkbox" id="bpt-ch-telegram" ${savedTgId ? 'checked' : ''} />
          <span>טלגרם</span>
        </label>
        <div id="bpt-tg-wrap" class="${savedTgId ? '' : 'bpt-hidden'}">
          <a href="https://t.me/HotelHunterlBot" target="_blank" rel="noopener" class="bpt-tg-link">לחץ כאן להפעלת הבוט</a>
          <div class="bpt-tg-id-row">
            <input class="bpt-phone-input" id="bpt-tg-id-input" type="text"
                   placeholder="Chat ID (מספר)" autocomplete="off"
                   value="${escapeHtml(savedTgId)}" />
            <label class="bpt-save-label">
              <input type="checkbox" id="bpt-save-tg-id" ${savedTgId ? 'checked' : ''} />
              <span>שמור Chat ID לפעם הבאה</span>
            </label>
            <button type="button" class="bpt-help-link" id="bpt-tg-help-btn">Don't know your Chat ID? Click here</button>
            <p class="bpt-help-text bpt-hidden" id="bpt-tg-help-text">Search for <strong>@userinfobot</strong> in Telegram and send it any message — it will reply with your Chat ID number.</p>
          </div>
        </div>
      </div>
      <div class="bpt-q">מתי לשלוח התראה?</div>
      <div class="bpt-opts">
        <button class="bpt-opt" type="button" data-drop="any">כל ירידה במחיר (גם ב-1 ₪)</button>
        <button class="bpt-opt" type="button" data-drop="5">ירידה של 5% (התראה מתחת ל-${escapeHtml(price5)})</button>
        <button class="bpt-opt" type="button" data-drop="10">ירידה של 10% ומטה (התראה מתחת ל-${escapeHtml(price10)})</button>
      </div>
    `;

    modal.querySelector('.bpt-x').addEventListener('click', closeModal);

    // Toggle email/telegram sections on checkbox change
    modal.querySelector('#bpt-ch-email').addEventListener('change', function () {
      modal.querySelector('#bpt-email-wrap').classList.toggle('bpt-hidden', !this.checked);
      if (this.checked) setTimeout(function () { modal.querySelector('#bpt-email-input').focus(); }, 50);
    });
    modal.querySelector('#bpt-ch-telegram').addEventListener('change', function () {
      modal.querySelector('#bpt-tg-wrap').classList.toggle('bpt-hidden', !this.checked);
      if (this.checked) setTimeout(function () { modal.querySelector('#bpt-tg-id-input').focus(); }, 50);
    });
    modal.querySelector('#bpt-tg-help-btn').addEventListener('click', function () {
      var txt = modal.querySelector('#bpt-tg-help-text');
      txt.classList.toggle('bpt-hidden');
    });

    // Use a capture-phase listener on document so Booking.com's own capture
    // handlers cannot swallow the click before we see it.
    function onDocClick(e) {
      var btn = e.target.closest('.bpt-opt');
      if (!btn) return;                        // click was not on a save button
      if (!document.getElementById('bpt-backdrop')) return; // modal not open

      e.stopImmediatePropagation();
      e.preventDefault();

      var emailCb      = modal.querySelector('#bpt-ch-email');
      var tgCb         = modal.querySelector('#bpt-ch-telegram');
      var emailInput   = modal.querySelector('#bpt-email-input');
      var saveEmailCb  = modal.querySelector('#bpt-save-email');
      var tgIdInput    = modal.querySelector('#bpt-tg-id-input');
      var saveTgIdCb   = modal.querySelector('#bpt-save-tg-id');

      var emailChecked = emailCb ? emailCb.checked : false;
      var tgChecked    = tgCb    ? tgCb.checked    : false;
      var email        = (emailChecked && emailInput) ? emailInput.value.trim() : null;
      var telegramChatId = (tgChecked && tgIdInput)  ? tgIdInput.value.trim()  : null;

      var payload = { emailChecked: emailChecked, tgChecked: tgChecked, email: email, telegramChatId: telegramChatId, drop: btn.getAttribute('data-drop'), currentPrice: currentPrice };
      console.log('SAVE BUTTON CLICKED!', payload);

      // Validation
      if (!emailChecked && !tgChecked) {
        showErr(modal, 'נא לבחור לפחות אמצעי התראה אחד.');
        return;
      }
      if (emailChecked && !email) {
        showErr(modal, 'נא להזין כתובת מייל.');
        if (emailInput) emailInput.focus();
        return;
      }
      if (emailChecked && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showErr(modal, 'כתובת מייל לא תקינה.');
        if (emailInput) emailInput.focus();
        return;
      }
      if (tgChecked && !telegramChatId) {
        showErr(modal, 'נא להזין את ה-Chat ID שלך בטלגרם.');
        if (tgIdInput) tgIdInput.focus();
        return;
      }
      if (!currentPrice) {
        showErr(modal, 'לא ניתן לזהות את המחיר הנוכחי.');
        return;
      }

      // Persist preferences
      if (emailChecked && saveEmailCb) {
        if (saveEmailCb.checked) localStorage.setItem(EMAIL_STORAGE_KEY, email);
        else localStorage.removeItem(EMAIL_STORAGE_KEY);
      }
      if (tgChecked && saveTgIdCb) {
        if (saveTgIdCb.checked) localStorage.setItem(TG_ID_STORAGE_KEY, telegramChatId);
        else localStorage.removeItem(TG_ID_STORAGE_KEY);
      }

      var drop = btn.getAttribute('data-drop');
      var target = drop === 'any'
        ? Math.max(1, Math.floor(currentPrice) - 1)
        : Math.max(1, Math.round(currentPrice * (1 - parseFloat(drop) / 100)));

      modal.querySelectorAll('.bpt-opt').forEach(function (b) { b.disabled = true; });
      submitTracking(modal, roomPackage, target, email, tgChecked, telegramChatId);
    }
    _bptSaveHandler = onDocClick;
    document.addEventListener('click', onDocClick, true); // capture phase

    function onKey(e) {
      if (e.key === 'Escape') { closeModal(); document.removeEventListener('keydown', onKey); }
    }
    document.addEventListener('keydown', onKey);

    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
  }

  function showErr(modal, msg) {
    let el = modal.querySelector('.bpt-err');
    if (!el) {
      el = document.createElement('p');
      el.className = 'bpt-err';
      modal.querySelector('.bpt-opts').after(el);
    }
    el.textContent = msg;
    modal.querySelectorAll('.bpt-opt').forEach(function (b) { b.disabled = false; });
  }

  function submitTracking(modal, roomPackage, targetPrice, email, telegram, telegramChatId) {
    fetch(BACKEND_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        url:            window.location.href,
        roomPackage:    roomPackage,
        targetPrice:    targetPrice,
        email:          email          || null,
        telegram:       telegram       || false,
        telegramChatId: telegramChatId || null,
      }),
    })
      .then(function (res) {
        if (!res.ok) return res.json().then(function (d) { throw new Error(d.error || 'שגיאת שרת'); });
        return res.json();
      })
      .then(function () { showSuccess(modal, targetPrice); })
      .catch(function (err) {
        console.error('[Booking Tracker] Backend error:', err);
        showErr(modal, err.message || 'לא ניתן להתחבר לשרת (פורט 3001).');
        modal.querySelectorAll('.bpt-opt').forEach(function (b) { b.disabled = false; });
      });
  }

  function showSuccess(modal, targetPrice) {
    modal.innerHTML = `
      <div class="bpt-ok">
        <div class="bpt-check">✅</div>
        <p>המעקב הופעל בהצלחה!<br>נשלח לך התראה כשהמחיר יצנח.</p>
        <button class="bpt-close-ok" type="button">סגור</button>
      </div>
    `;
    modal.querySelector('.bpt-close-ok').addEventListener('click', closeModal);
  }

  // ── MutationObserver ─────────────────────────────────────────────────────────

  function startObserver() {
    let timer = null;
    const observer = new MutationObserver(function (mutations) {
      const external = mutations.some(function (m) {
        return Array.from(m.addedNodes).some(function (n) {
          return n.nodeType === Node.ELEMENT_NODE &&
                 n.id !== 'bpt-backdrop' &&
                 !n.classList.contains('bpt-track-btn');
        });
      });
      if (!external) return;
      clearTimeout(timer);
      timer = setTimeout(injectButtons, 700);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // ── Boot ─────────────────────────────────────────────────────────────────────

  injectStyles();
  injectButtons();
  startObserver();

})();

'use strict';

function escHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function fmtDate(d) {
  if (!d) return '—';
  const dt  = new Date(d);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(dt.getDate())}/${pad(dt.getMonth() + 1)}/${dt.getFullYear()} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

function fmtPrice(n) {
  if (n == null) return null;
  return '₪' + Number(n).toLocaleString('he-IL');
}

// Column order in HTML (left → right on screen):
//   Email | Telegram | Vacation | Target | Booking | Hotel Name | Stay Details | Date Added | Hotel Link | Actions
// With dir="rtl" the user reads right-to-left, so Date Added area is the first thing they see.
function renderRow(row) {
  const hotelCell = row.hotelName
    ? `<div class="font-medium text-white text-sm">${escHtml(row.hotelName)}</div>`
    : `<div class="text-slate-500 text-sm italic">N/A</div>`;
  const pkgCell = row.roomPackage
    ? `<div class="text-xs text-slate-400 mt-0.5 max-w-[220px] truncate" title="${escHtml(row.roomPackage)}">${escHtml(row.roomPackage)}</div>`
    : '';

  const bookingPriceCell = row.originalPrice
    ? `<span class="font-semibold text-emerald-400">${fmtPrice(row.originalPrice)}</span>`
    : `<span class="text-slate-500 italic text-xs">N/A</span>`;

  const discountPct = (row.originalPrice && row.targetPrice && row.originalPrice > row.targetPrice)
    ? Math.round((1 - row.targetPrice / row.originalPrice) * 100)
    : null;
  const targetCell = `<div class="font-semibold text-amber-400">${fmtPrice(row.targetPrice)}`
    + (discountPct ? ` <span class="text-slate-400 font-normal">(${discountPct}%)</span>` : '')
    + `</div>`;

  const datesCell = (row.checkIn && row.checkOut)
    ? `<div class="text-xs text-slate-300">${escHtml(row.checkIn)}</div><div class="text-xs text-slate-400">→ ${escHtml(row.checkOut)}</div>`
    : `<span class="text-slate-500 italic text-xs">N/A</span>`;

  const tgCell = row.telegramChatId
    ? `<span class="font-mono text-blue-400 text-xs bg-blue-400/10 px-2 py-0.5 rounded">${escHtml(row.telegramChatId)}</span>`
    : `<span class="text-slate-500 italic text-xs">עדיין לא הוזן</span>`;

  const emailCell = row.email
    ? `<span class="text-blue-400 text-xs">${escHtml(row.email)}</span>`
    : `<span class="text-slate-500 italic text-xs">עדיין לא הוזן</span>`;

  const guestsVal = row.guests != null ? row.guests : null;
  const roomsVal  = row.rooms  != null ? row.rooms  : null;
  const stayParts = [];
  if (guestsVal != null) stayParts.push(`${guestsVal} אורחים`);
  if (roomsVal  != null) stayParts.push(`${roomsVal} חדרים`);
  const roomTypeText = row.roomType
    ? `<div class="text-xs text-slate-400 mt-1" dir="rtl">${escHtml(row.roomType)}</div>`
    : '';
  const stayCell = (stayParts.length > 0 || roomTypeText)
    ? `<div class="text-xs text-slate-300" dir="rtl">${stayParts.join(' | ')}</div>${roomTypeText}`
    : `<span class="text-slate-500 italic text-xs">N/A</span>`;

  const id = escHtml(String(row._id));
  const searchData = [row.hotelName, row.roomPackage, row.email, row.telegramChatId]
    .filter(Boolean).join(' ').toLowerCase();

  return `
    <tr id="row-${id}" data-search="${escHtml(searchData)}"
        class="border-b border-slate-700/50 hover:bg-slate-700/20 transition-colors group">
      <td class="px-4 py-3 align-top pt-4">${emailCell}</td>
      <td class="px-4 py-3 align-top pt-4">${tgCell}</td>
      <td class="px-4 py-3 align-top pt-4">${datesCell}</td>
      <td class="px-4 py-3 align-top pt-4">${targetCell}</td>
      <td class="px-4 py-3 align-top pt-4">${bookingPriceCell}</td>
      <td class="px-4 py-3 align-top pt-4">${hotelCell}${pkgCell}</td>
      <td class="px-4 py-3 align-top pt-4">${stayCell}</td>
      <td class="px-4 py-3 text-xs text-slate-400 whitespace-nowrap align-top pt-4">${fmtDate(row.addedAt)}</td>
      <td class="px-4 py-3 align-top pt-4 text-center">
        <a href="${escHtml(row.url)}" target="_blank" rel="noopener noreferrer"
           class="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs px-3 py-1.5 rounded-lg transition-colors font-medium whitespace-nowrap">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
          </svg>
          Open
        </a>
      </td>
      <td class="px-4 py-3 align-top pt-4 text-center">
        <button onclick="deleteRow('${id}')"
           class="inline-flex items-center gap-1.5 bg-red-500/10 hover:bg-red-500 active:bg-red-700 text-red-400 hover:text-white text-xs px-3 py-1.5 rounded-lg transition-all border border-red-500/30 hover:border-transparent font-medium whitespace-nowrap">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
          </svg>
          Delete
        </button>
      </td>
    </tr>`;
}

function renderAdminPage(rows) {
  const withEmail    = rows.filter((r) => r.email).length;
  const withTelegram = rows.filter((r) => r.telegramChatId).length;
  const tableRows    = rows.map(renderRow).join('');

  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Admin · Booking Price Tracker</title>
  <script src="https://cdn.tailwindcss.com"><\/script>
  <style>
    ::-webkit-scrollbar            { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track      { background: #0f172a; }
    ::-webkit-scrollbar-thumb      { background: #334155; border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover{ background: #475569; }
    .toast { animation: slideIn .25s ease, fadeOut .4s ease 2.6s forwards; }
    @keyframes slideIn  { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
    @keyframes fadeOut  { to   { opacity:0; transform:translateY(-8px); } }
  </style>
</head>
<body class="bg-slate-900 text-slate-100 min-h-screen p-4 md:p-8 font-sans">

  <!-- Toast container (left side in RTL layout) -->
  <div id="toast-area" class="fixed bottom-6 left-6 z-50 flex flex-col gap-2 pointer-events-none"></div>

  <div class="max-w-[1700px] mx-auto">

    <!-- ── Header ── -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
      <div class="flex items-center gap-3">
        <div class="w-11 h-11 bg-blue-600 rounded-2xl flex items-center justify-center text-2xl shadow-lg shadow-blue-600/30">🏨</div>
        <div>
          <h1 class="text-2xl font-bold text-white tracking-tight">Admin Dashboard</h1>
          <p class="text-slate-400 text-sm">Booking Price Tracker — live data</p>
        </div>
      </div>
      <div class="flex items-center gap-3">
        <div class="relative">
          <!-- Search icon on the right side of input (RTL) -->
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"/>
          </svg>
          <input id="search-input" type="text" placeholder="Search hotel, email, Telegram…"
                 class="bg-slate-800 border border-slate-700 rounded-xl pr-9 pl-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 w-72 transition-shadow">
        </div>
        <button onclick="location.reload()"
                class="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
          </svg>
          Refresh
        </button>
      </div>
    </div>

    <!-- ── Stats ── -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
      <div class="bg-slate-800 border border-slate-700 rounded-2xl p-5 flex items-center gap-4">
        <div class="w-12 h-12 bg-slate-700 rounded-xl flex items-center justify-center text-2xl">📋</div>
        <div>
          <div class="text-slate-400 text-xs font-medium uppercase tracking-wider">Total Requests</div>
          <div class="text-3xl font-bold text-white mt-0.5">${rows.length}</div>
        </div>
      </div>
      <div class="bg-slate-800 border border-slate-700 rounded-2xl p-5 flex items-center gap-4">
        <div class="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center text-2xl">✉️</div>
        <div>
          <div class="text-slate-400 text-xs font-medium uppercase tracking-wider">With Email</div>
          <div class="text-3xl font-bold text-blue-400 mt-0.5">${withEmail}</div>
        </div>
      </div>
      <div class="bg-slate-800 border border-slate-700 rounded-2xl p-5 flex items-center gap-4">
        <div class="w-12 h-12 bg-green-500/20 rounded-xl flex items-center justify-center text-2xl">💬</div>
        <div>
          <div class="text-slate-400 text-xs font-medium uppercase tracking-wider">With Telegram</div>
          <div class="text-3xl font-bold text-green-400 mt-0.5">${withTelegram}</div>
        </div>
      </div>
    </div>

    <!-- ── Table ──
         dir="ltr" on the table locks physical column order regardless of page RTL.
         Columns are written LEFT→RIGHT in HTML as:
           Actions | Hotel Link | Email | Telegram | Vacation | Target | Booking | Hotel Name | Date Added
         So on screen the rightmost column is Date Added and leftmost is Actions.
    -->
    <div class="bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden shadow-xl">
      <div class="overflow-x-auto">
        <table class="w-full" dir="ltr">
          <thead>
            <tr class="bg-slate-700/40 text-slate-400 text-xs font-semibold uppercase tracking-wider border-b border-slate-700">
              <th class="px-4 py-3 text-left  whitespace-nowrap">Email</th>
              <th class="px-4 py-3 text-left  whitespace-nowrap">Telegram ID</th>
              <th class="px-4 py-3 text-left  whitespace-nowrap">Vacation Dates</th>
              <th class="px-4 py-3 text-left  whitespace-nowrap">Target Price + %</th>
              <th class="px-4 py-3 text-left  whitespace-nowrap">Booking Price</th>
              <th class="px-4 py-3 text-left  whitespace-nowrap">Hotel Name</th>
              <th class="px-4 py-3 text-left  whitespace-nowrap">Stay Details</th>
              <th class="px-4 py-3 text-left  whitespace-nowrap">Date Added</th>
              <th class="px-4 py-3 text-center whitespace-nowrap">Hotel Link</th>
              <th class="px-4 py-3 text-center whitespace-nowrap">Actions</th>
            </tr>
          </thead>
          <tbody id="table-body">
            ${tableRows || '<tr><td colspan="10" class="px-4 py-20 text-center text-slate-500 text-sm">No tracking requests found.</td></tr>'}
          </tbody>
        </table>
      </div>
      <div class="px-5 py-3 bg-slate-700/20 border-t border-slate-700 flex items-center justify-between">
        <span class="text-xs text-slate-500">
          Showing <span id="visible-count" class="text-slate-300 font-medium">${rows.length}</span>
          of <span class="text-slate-300 font-medium">${rows.length}</span> requests
        </span>
        <span class="text-xs text-slate-600">Last loaded: ${new Date().toLocaleTimeString('he-IL')}</span>
      </div>
    </div>

  </div>

  <script>
    /* ── Search ── */
    var searchInput  = document.getElementById('search-input');
    var tableBody    = document.getElementById('table-body');
    var visibleCount = document.getElementById('visible-count');

    searchInput.addEventListener('input', function () {
      var q    = this.value.toLowerCase().trim();
      var rows = tableBody.querySelectorAll('tr[id^="row-"]');
      var n    = 0;
      rows.forEach(function (row) {
        var haystack = (row.dataset.search || '') + ' ' + row.textContent.toLowerCase();
        var show     = !q || haystack.includes(q);
        row.style.display = show ? '' : 'none';
        if (show) n++;
      });
      if (visibleCount) visibleCount.textContent = n;
    });

    /* ── Delete ── */
    async function deleteRow(id) {
      if (!confirm('Delete this tracking request?\\nThis cannot be undone.')) return;
      try {
        var res = await fetch('/api/track/' + id, { method: 'DELETE' });
        if (!res.ok) {
          var body = {};
          try { body = await res.json(); } catch (e) {}
          throw new Error(body.error || 'Server error ' + res.status);
        }
        var row = document.getElementById('row-' + id);
        if (row) {
          row.style.transition = 'opacity 0.3s, transform 0.3s';
          row.style.opacity    = '0';
          row.style.transform  = 'translateX(-16px)';
          setTimeout(function () {
            row.remove();
            var remaining = tableBody.querySelectorAll('tr[id^="row-"]:not([style*="display: none"])').length;
            if (visibleCount) visibleCount.textContent = remaining;
          }, 300);
        }
        showToast('Request deleted successfully.', 'success');
      } catch (err) {
        showToast('Failed to delete: ' + err.message, 'error');
      }
    }

    /* ── Toast ── */
    function showToast(msg, type) {
      var area  = document.getElementById('toast-area');
      var toast = document.createElement('div');
      var color = type === 'error' ? 'bg-red-500' : 'bg-emerald-500';
      toast.className = 'toast pointer-events-auto ' + color + ' text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-lg';
      toast.textContent = msg;
      area.appendChild(toast);
      setTimeout(function () { toast.remove(); }, 3000);
    }
  <\/script>
</body>
</html>`;
}

module.exports = { renderAdminPage };

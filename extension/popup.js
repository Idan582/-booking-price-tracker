const BACKEND_URL = "https://booking-price-tracker-production-3aae.up.railway.app";
const INJECT_TIMEOUT_MS = 8000; // give the page 8 s to respond before falling back

const hotelNameEl     = document.getElementById("hotel-name");
const hotelDatesEl    = document.getElementById("hotel-dates");
const packageSelectEl = document.getElementById("package-select");
const packageManualEl = document.getElementById("package-manual");
const scanErrorEl     = document.getElementById("scan-error");
const targetPriceEl   = document.getElementById("target-price");
const trackBtn        = document.getElementById("track-btn");
const statusEl        = document.getElementById("status");
const warningEl       = document.getElementById("not-booking-warning");

let currentUrl   = "";
let isManualMode = false;

// ---------------------------------------------------------------------------
// Package extraction — injected into the Booking.com tab via func:.
//
// Using func: (not files:) guarantees Chrome captures the explicit return
// value. The files: approach relies on "last evaluated expression" semantics
// that are less reliable across Chrome versions.
//
// The function MUST be self-contained — no references to outer scope.
// ---------------------------------------------------------------------------
function extractPackages() {
  const seen     = new Set();
  const packages = [];

  function clean(el) {
    return el ? el.textContent.replace(/\s+/g, " ").trim() : "";
  }

  function addPackage(roomName, conditionEls) {
    const name = roomName.trim();
    if (!name || name.length < 2) return;
    const parts = [name];
    conditionEls.forEach(function (el) {
      var t = clean(el);
      if (t && t !== name && !parts.includes(t) && t.length <= 120) parts.push(t);
    });
    var pkg = parts.join(" - ");
    if (!seen.has(pkg)) { seen.add(pkg); packages.push(pkg); }
  }

  // ── Strategy 1: Classic hprt table ────────────────────────────────────────
  var table = document.querySelector(
    "table.hprt-table, #hprt-table, [data-selenium='hotel-availability-table']"
  );
  if (table) {
    var currentRoomName = "";
    table.querySelectorAll("tbody tr").forEach(function (row) {
      var nameEl = row.querySelector(
        ".hprt-roomtype-link," +
        "[data-selenium='roomName'] a," +
        ".hprt-roomtype-name," +
        "[data-testid='roomtype-name']," +
        "[data-testid='room-name']"
      );
      if (nameEl) currentRoomName = clean(nameEl);
      if (!currentRoomName) return;

      var hasBookBtn = row.querySelector(
        ".hprt-booking-cta," +
        "[data-selenium='cta-button-element']," +
        ".sr_cta_button," +
        "[data-testid='submit-button']," +
        "button[data-testid]"
      );
      if (!hasBookBtn) return;

      addPackage(currentRoomName, [].concat(
        Array.from(row.querySelectorAll(
          ".hprt-meal-type,.meal-type-content," +
          "[data-selenium='meal-type'],[data-testid='meal-plan-text']"
        )),
        Array.from(row.querySelectorAll(
          ".hprt-free-cancellation,.hprt-non-refundable," +
          "[data-testid='cancellation-policy-text']"
        )),
        Array.from(row.querySelectorAll(".hprt-conditions li"))
      ));
    });
  }

  // ── Strategy 2: Modern data-testid room-type blocks (React SPA) ───────────
  if (packages.length === 0) {
    document.querySelectorAll(
      "[data-testid='rt-roomtype-block']," +
      "[data-testid='hprt-roomtype-block']," +
      "[data-testid='room-type-block']," +
      "[data-testid='roomtype-block']"
    ).forEach(function (block) {
      var nameEl = block.querySelector(
        "[data-testid='roomtype-name']," +
        "[data-testid='room-type-name']," +
        "[data-testid='rt-roomtype-name']," +
        "[data-testid='room-name']," +
        ".hprt-roomtype-link"
      );
      if (!nameEl) return;
      var roomName = clean(nameEl);

      var offerBlocks = block.querySelectorAll(
        "[data-testid='rt-offer-block']," +
        "[data-testid='offer-list-item']," +
        "[data-testid='offer-block']," +
        ".hprt-roomtype-offer"
      );

      if (offerBlocks.length > 0) {
        offerBlocks.forEach(function (offer) {
          addPackage(roomName, [].concat(
            Array.from(offer.querySelectorAll("[data-testid='cancellation-policy-text'],[data-testid*='cancel']")),
            Array.from(offer.querySelectorAll("[data-testid='meal-plan-text'],[data-testid*='meal']")),
            Array.from(offer.querySelectorAll("[data-testid='offer-feature'],[data-testid*='condition']")),
            Array.from(offer.querySelectorAll("[class*='cancellation'],[class*='mealPlan'],[class*='meal-plan']"))
          ));
        });
      } else {
        addPackage(roomName, [].concat(
          Array.from(block.querySelectorAll("[data-testid*='cancel'],[data-testid*='meal'],[data-testid*='condition']")),
          Array.from(block.querySelectorAll("[class*='cancellation'],[class*='mealPlan'],[class*='condition']"))
        ));
      }
    });
  }

  // ── Strategy 3: Recommendation / "cheapest option" card ───────────────────
  if (packages.length === 0) {
    document.querySelectorAll(
      ".recommended_block," +
      ".hp_cheapest_block," +
      "[data-testid='recommended-rooms-block']," +
      "[data-testid*='recommendation']," +
      "[data-testid*='cheapest']," +
      "[class*='RecommendedRooms']," +
      "[class*='recommendedRoom']"
    ).forEach(function (card) {
      var nameEl = card.querySelector(
        ".recommended-room-type-name," +
        ".room-name," +
        "[class*='roomName']," +
        "[class*='room-name']," +
        "[data-testid*='room-name']," +
        "[data-testid*='roomName']"
      );
      if (!nameEl) return;
      addPackage(clean(nameEl), [].concat(
        Array.from(card.querySelectorAll("[class*='cancellation'],[class*='cancel']")),
        Array.from(card.querySelectorAll("[class*='meal'],[class*='breakfast']")),
        Array.from(card.querySelectorAll(".bui-list__item,.bui-badge,[class*='condition']"))
      ));
    });
  }

  // ── Strategy 4: Full-page broad sweep ─────────────────────────────────────
  if (packages.length === 0) {
    var NAME_SELS =
      ".hprt-roomtype-link," +
      "[data-testid='room-name']," +
      "[data-testid='roomtype-name']," +
      "[data-testid='room-type-name']," +
      "[data-selenium='roomName']," +
      "[class*='RoomName']," +
      "[class*='roomName']," +
      "[class*='room-name']," +
      "[class*='roomtype-name']," +
      ".room-name," +
      ".bui-title";

    var COND_SELS =
      "[class*='cancellation']," +
      "[class*='free-cancel']," +
      "[class*='nonRefundable']," +
      "[class*='non-refundable']," +
      "[class*='meal']," +
      "[class*='breakfast']," +
      "[class*='boardType']," +
      "[class*='condition']," +
      ".bui-badge," +
      ".bui-list__item";

    document.querySelectorAll(NAME_SELS).forEach(function (el) {
      var roomName = clean(el);
      if (roomName.length < 3 || roomName.length > 100) return;
      if (el.closest("nav,header,footer,[role='navigation']")) return;
      if (el.tagName === "BUTTON" || el.closest("button")) return;

      var container =
        el.closest("[data-testid],[data-block-id],[class*='room'],[class*='block'],[class*='card'],tr,li") ||
        (el.parentElement && el.parentElement.parentElement);

      addPackage(roomName, container ? Array.from(container.querySelectorAll(COND_SELS)) : []);
    });
  }

  return packages;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isBookingUrl(url) {
  try {
    var parsed = new URL(url);
    return parsed.hostname === "www.booking.com" && parsed.pathname.includes("/hotel/");
  } catch (_) {
    return false;
  }
}

function parseHotelName(pathname) {
  var parts = pathname.split("/").filter(Boolean);
  if (parts.length < 3) return null;
  var slug = parts[2].replace(/\.[^.]+\.[^.]+$/, "");
  return slug.split("-").map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join(" ");
}

function formatDate(dateStr) {
  if (!dateStr) return null;
  var p = dateStr.split("-").map(Number);
  if (!p[0] || !p[1] || !p[2]) return null;
  return new Date(p[0], p[1] - 1, p[2]).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function renderUrlPreview(url) {
  if (!isBookingUrl(url)) {
    hotelNameEl.textContent = "Not a hotel page";
    hotelDatesEl.innerHTML = "";
    return;
  }
  var parsed   = new URL(url);
  var checkIn  = formatDate(parsed.searchParams.get("checkin"));
  var checkOut = formatDate(parsed.searchParams.get("checkout"));
  hotelNameEl.textContent = parseHotelName(parsed.pathname) || "Unknown Hotel";
  if (checkIn && checkOut) {
    hotelDatesEl.textContent = checkIn + " → " + checkOut;
  } else {
    hotelDatesEl.innerHTML = '<span class="no-dates">No dates selected</span>';
  }
}

function showStatus(message, type) {
  statusEl.textContent = message;
  statusEl.className   = type;
}

function clearStatus() {
  statusEl.textContent = "";
  statusEl.className   = "";
}

// ---------------------------------------------------------------------------
// Package UI helpers
// ---------------------------------------------------------------------------

function showDropdown(packages) {
  packageSelectEl.innerHTML = "";
  var placeholder       = document.createElement("option");
  placeholder.value     = "";
  placeholder.textContent = "Select a package…";
  placeholder.disabled  = true;
  placeholder.selected  = true;
  packageSelectEl.appendChild(placeholder);

  packages.forEach(function (pkg) {
    var opt       = document.createElement("option");
    opt.value     = pkg;
    opt.textContent = pkg;
    packageSelectEl.appendChild(opt);
  });

  packageSelectEl.disabled  = false;
  packageSelectEl.style.display = "";
  packageManualEl.style.display = "none";
  scanErrorEl.style.display     = "none";
  isManualMode = false;
}

function showManualFallback(reason) {
  isManualMode = true;
  packageSelectEl.style.display = "none";
  packageManualEl.style.display = "";
  packageManualEl.focus();

  scanErrorEl.className   = "scan-warning";
  scanErrorEl.textContent = (reason ? reason + " " : "") +
    'Enter the room name and conditions manually, e.g. "Junior Suite - Breakfast included".';
  scanErrorEl.style.display = "block";
}

// ---------------------------------------------------------------------------
// Initialise: query active tab → render preview → inject content script
// ---------------------------------------------------------------------------
chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
  // Check for API errors first
  if (chrome.runtime.lastError) {
    hotelNameEl.textContent = "Error: " + chrome.runtime.lastError.message;
    return;
  }

  if (!tabs || tabs.length === 0) {
    hotelNameEl.textContent = "Could not detect current tab.";
    return;
  }

  var tab   = tabs[0];
  currentUrl = tab.url || "";

  // Render hotel name / dates immediately — happens synchronously, before scripting
  renderUrlPreview(currentUrl);

  if (!isBookingUrl(currentUrl)) {
    warningEl.style.display       = "block";
    trackBtn.disabled             = true;
    packageSelectEl.innerHTML     = '<option value="">N/A — not a hotel page</option>';
    return;
  }

  // Race the injection against a timeout so we never stay stuck
  var injectPromise = chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: extractPackages,
  });

  var timeoutPromise = new Promise(function (resolve) {
    setTimeout(function () { resolve("__timeout__"); }, INJECT_TIMEOUT_MS);
  });

  Promise.race([injectPromise, timeoutPromise]).then(function (outcome) {
    if (outcome === "__timeout__") {
      showManualFallback("Could not scan the page in time (the tab may still be loading).");
      return;
    }

    // outcome is the InjectionResult array
    var packages = outcome && outcome[0] && outcome[0].result;
    if (!Array.isArray(packages) || packages.length === 0) {
      showManualFallback(
        packages === null || packages === undefined
          ? "Could not scan the page."
          : "No room packages were detected (Booking.com may be using a different layout)."
      );
      return;
    }

    showDropdown(packages);
  }).catch(function (err) {
    console.error("executeScript failed:", err);
    showManualFallback("Could not scan the page (" + (err.message || "unknown error") + ").");
  });
});

// ---------------------------------------------------------------------------
// "Start Tracking" click handler
// ---------------------------------------------------------------------------
trackBtn.addEventListener("click", function () {
  clearStatus();

  var selectedPackage = isManualMode
    ? packageManualEl.value.trim()
    : packageSelectEl.value;

  var targetPrice = parseFloat(targetPriceEl.value);

  if (!currentUrl || !isBookingUrl(currentUrl)) {
    showStatus("Please open a Booking.com hotel page before tracking.", "error");
    return;
  }

  if (!selectedPackage) {
    showStatus(
      isManualMode ? "Please type a room package name." : "Please select a room package from the dropdown.",
      "error"
    );
    (isManualMode ? packageManualEl : packageSelectEl).focus();
    return;
  }

  if (isNaN(targetPrice) || targetPrice <= 0) {
    showStatus("Please enter a valid target price greater than 0.", "error");
    targetPriceEl.focus();
    return;
  }

  trackBtn.disabled     = true;
  trackBtn.textContent  = "Tracking…";

  fetch(BACKEND_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: currentUrl, roomPackage: selectedPackage, targetPrice: targetPrice }),
  })
    .then(function (response) {
      return response.json().then(function (data) {
        if (response.ok) {
          showStatus(
            '✓ Tracking started! You\'ll be alerted when "' + selectedPackage + '" drops below ₪' + targetPrice + '.',
            "success"
          );
          targetPriceEl.value = "";
          if (isManualMode) packageManualEl.value = "";
        } else {
          showStatus("Error: " + (data.error || "Unknown server error."), "error");
        }
      });
    })
    .catch(function (err) {
      showStatus("Could not connect to the backend. Make sure the server is running on port 3001.", "error");
      console.error("Backend connection error:", err);
    })
    .finally(function () {
      trackBtn.disabled    = false;
      trackBtn.textContent = "Start Tracking";
    });
});

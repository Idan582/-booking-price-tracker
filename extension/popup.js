const BACKEND_URL = "http://localhost:3001/api/track";

const urlTextEl = document.getElementById("url-text");
const targetPriceEl = document.getElementById("target-price");
const trackBtn = document.getElementById("track-btn");
const statusEl = document.getElementById("status");
const warningEl = document.getElementById("not-booking-warning");

let currentUrl = "";

function isBookingUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname === "www.booking.com" && parsed.pathname.includes("/hotel/");
  } catch {
    return false;
  }
}

function showStatus(message, type) {
  statusEl.textContent = message;
  statusEl.className = type; // "success" or "error"
}

function clearStatus() {
  statusEl.textContent = "";
  statusEl.className = "";
}

// Load the current active tab's URL when popup opens
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  if (!tabs || tabs.length === 0) {
    urlTextEl.textContent = "Could not detect current tab.";
    return;
  }

  currentUrl = tabs[0].url || "";
  urlTextEl.textContent = currentUrl || "No URL found.";

  if (!isBookingUrl(currentUrl)) {
    warningEl.style.display = "block";
    trackBtn.disabled = true;
  }
});

trackBtn.addEventListener("click", async () => {
  clearStatus();

  const targetPrice = parseFloat(targetPriceEl.value);

  // --- Validation ---
  if (!currentUrl || !isBookingUrl(currentUrl)) {
    showStatus("Please open a Booking.com hotel page before tracking.", "error");
    return;
  }

  if (isNaN(targetPrice) || targetPrice <= 0) {
    showStatus("Please enter a valid target price greater than 0.", "error");
    targetPriceEl.focus();
    return;
  }

  // --- Send to backend ---
  trackBtn.disabled = true;
  trackBtn.textContent = "Tracking...";

  try {
    const response = await fetch(BACKEND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: currentUrl,
        targetPrice: targetPrice,
      }),
    });

    const data = await response.json();

    if (response.ok) {
      showStatus(`✓ Tracking started! You'll be alerted when the price drops below $${targetPrice}.`, "success");
      targetPriceEl.value = "";
    } else {
      showStatus(`Error: ${data.error || "Unknown server error."}`, "error");
    }
  } catch (err) {
    showStatus(
      "Could not connect to the backend. Make sure the server is running on port 3001.",
      "error"
    );
    console.error("Backend connection error:", err);
  } finally {
    trackBtn.disabled = false;
    trackBtn.textContent = "Start Tracking";
  }
});

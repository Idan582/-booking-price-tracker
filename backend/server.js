const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 3001;
const DATA_FILE = path.join(__dirname, "tracked_hotels.json");

// --- Middleware ---
app.use(cors({ origin: "*" })); // Allow requests from the Chrome extension
app.use(express.json());

// --- Helpers ---

function loadTrackedHotels() {
  if (!fs.existsSync(DATA_FILE)) {
    return [];
  }
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveTrackedHotels(hotels) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(hotels, null, 2), "utf-8");
}

function isValidBookingUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname === "www.booking.com" && parsed.pathname.includes("/hotel/");
  } catch {
    return false;
  }
}

// --- Routes ---

// POST /api/track — Add a new hotel to track
app.post("/api/track", (req, res) => {
  const { url, targetPrice } = req.body;

  // Validate presence
  if (!url || targetPrice === undefined || targetPrice === null) {
    return res.status(400).json({ error: "Both 'url' and 'targetPrice' are required." });
  }

  // Validate URL
  if (!isValidBookingUrl(url)) {
    return res.status(400).json({ error: "URL must be a valid Booking.com hotel page." });
  }

  // Validate price
  const price = parseFloat(targetPrice);
  if (isNaN(price) || price <= 0) {
    return res.status(400).json({ error: "'targetPrice' must be a positive number." });
  }

  const hotels = loadTrackedHotels();

  // Check for duplicates (same URL already being tracked)
  const existingIndex = hotels.findIndex((h) => h.url === url);

  const entry = {
    id: existingIndex >= 0 ? hotels[existingIndex].id : Date.now().toString(),
    url,
    targetPrice: price,
    addedAt: existingIndex >= 0 ? hotels[existingIndex].addedAt : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (existingIndex >= 0) {
    hotels[existingIndex] = entry;
    console.log(`[UPDATED] Target price updated for: ${url} → $${price}`);
  } else {
    hotels.push(entry);
    console.log(`[ADDED] Now tracking: ${url} at target $${price}`);
  }

  saveTrackedHotels(hotels);

  return res.status(200).json({
    message: existingIndex >= 0 ? "Tracking updated successfully." : "Tracking started successfully.",
    entry,
  });
});

// GET /api/track — List all tracked hotels (useful for debugging)
app.get("/api/track", (req, res) => {
  const hotels = loadTrackedHotels();
  res.json({ count: hotels.length, hotels });
});

// DELETE /api/track/:id — Remove a tracked hotel by ID
app.delete("/api/track/:id", (req, res) => {
  const { id } = req.params;
  let hotels = loadTrackedHotels();
  const before = hotels.length;
  hotels = hotels.filter((h) => h.id !== id);

  if (hotels.length === before) {
    return res.status(404).json({ error: `No tracked hotel found with id '${id}'.` });
  }

  saveTrackedHotels(hotels);
  console.log(`[REMOVED] Stopped tracking id: ${id}`);
  res.json({ message: "Tracking removed successfully." });
});

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// --- Start server ---
app.listen(PORT, () => {
  console.log(`\nBooking Price Tracker backend running on http://localhost:${PORT}`);
  console.log(`Data file: ${DATA_FILE}`);
  console.log("\nAvailable endpoints:");
  console.log(`  POST   http://localhost:${PORT}/api/track   — Add/update a hotel to track`);
  console.log(`  GET    http://localhost:${PORT}/api/track   — List all tracked hotels`);
  console.log(`  DELETE http://localhost:${PORT}/api/track/:id — Stop tracking a hotel`);
  console.log(`  GET    http://localhost:${PORT}/health      — Health check\n`);
});

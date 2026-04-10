'use strict';

const mongoose = require('mongoose');

// Parse useful fields directly from a Booking.com hotel URL
function parseBookingUrl(rawUrl) {
  try {
    const u       = new URL(rawUrl);
    const parts   = u.pathname.split('/').filter(Boolean);
    // pathname: /hotel/<country>/<slug>.he.html
    const location  = parts[1] || null;
    const slug      = (parts[2] || '').replace(/\.[^.]+\.[^.]+$/, '');
    const hotelName = slug
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ') || null;

    const checkIn   = u.searchParams.get('checkin')  || null;
    const checkOut  = u.searchParams.get('checkout') || null;
    const adults    = parseInt(u.searchParams.get('group_adults')   || '0', 10);
    const children  = parseInt(u.searchParams.get('group_children') || '0', 10);
    const guests    = (adults + children) || null;

    return { hotelName, location, checkIn, checkOut, guests };
  } catch {
    return { hotelName: null, location: null, checkIn: null, checkOut: null, guests: null };
  }
}

const trackingSchema = new mongoose.Schema(
  {
    url:            { type: String, required: true },
    roomPackage:    { type: String, required: true },
    targetPrice:    { type: Number, required: true },
    email:          { type: String,  default: null },
    telegram:       { type: Boolean, default: false },
    telegramChatId: { type: String,  default: null },
    // Derived from URL at save time — handy for display / filtering
    hotelName:      { type: String,  default: null },
    location:       { type: String,  default: null },
    checkIn:        { type: String,  default: null },
    checkOut:       { type: String,  default: null },
    guests:         { type: Number,  default: null },
    originalPrice:  { type: Number,  default: null },
    alertCount:     { type: Number,  default: 0 },
  },
  {
    // Mongoose auto-manages createdAt / updatedAt
    timestamps: { createdAt: 'addedAt', updatedAt: 'updatedAt' },
  }
);

// One entry per URL + room-package combination
trackingSchema.index({ url: 1, roomPackage: 1 }, { unique: true });

// Enrich a document with parsed URL fields before saving
trackingSchema.pre('save', function (next) {
  if (this.isNew || this.isModified('url')) {
    const parsed = parseBookingUrl(this.url);
    this.hotelName = this.hotelName || parsed.hotelName;
    this.location  = this.location  || parsed.location;
    this.checkIn   = this.checkIn   || parsed.checkIn;
    this.checkOut  = this.checkOut  || parsed.checkOut;
    if (this.guests == null) this.guests = parsed.guests;
  }
  next();
});

module.exports = mongoose.model('TrackingRequest', trackingSchema);

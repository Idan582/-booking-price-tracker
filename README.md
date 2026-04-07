# Booking.com Price Tracker Bot 🔔

> מעקב אוטומטי אחרי מחירי מלונות ב-Booking.com עם התראות בזמן אמת  
> Automatically tracks hotel prices on Booking.com and sends real-time alerts

---

## תיאור הפרויקט | About

כלי שמאפשר לך לעקוב אחרי מחיר חדר ספציפי ב-Booking.com.  
ברגע שהמחיר יורד מתחת ליעד שהגדרת — תקבל התראה מיידית במייל ו/או בטלגרם.

Track any hotel room package on Booking.com. The moment the price drops below your target — you get an instant alert via Email and/or Telegram.

---

## תכונות עיקריות | Key Features

- **תוסף Chrome** — לחצן "עקוב אחרי מחיר" מופיע ישירות על דף המלון ב-Booking.com
- **התראות טלגרם** — הודעה מיידית מהבוט שלך כשהמחיר יורד
- **התראות מייל (Gmail)** — אימייל HTML מעוצב עם קישור ישיר להזמנה
- **שרת Node.js מקומי** — בודק מחירים אוטומטית כל 2 שעות עם Playwright
- **Chrome Extension** — "Track Price" button injected directly on Booking.com hotel pages
- **Telegram Bot alerts** — instant message when price drops
- **Email alerts via Gmail** — styled HTML email with a direct booking link
- **Local Node.js server** — automated price checks every 2 hours using Playwright

---

## ארכיטקטורה | Architecture

```
booking-price-tracker/
├── backend/
│   ├── server.js          # Express API + cron scheduler
│   ├── scraper.js         # Playwright scraper + Email/Telegram alerts
│   ├── .env.example       # Template for environment variables
│   └── package.json
└── extension/
    ├── manifest.json      # Chrome Extension config (Manifest V3)
    ├── content.js         # Injected into Booking.com pages
    ├── popup.html         # Extension popup UI
    └── popup.js           # Popup logic
```

---

## התקנה | Installation

### דרישות מקדימות | Prerequisites

- [Node.js](https://nodejs.org/) v18+
- Google Chrome
- חשבון Gmail עם [App Password](https://myaccount.google.com/apppasswords) (לא הסיסמה הרגילה)
- בוט טלגרם (ניתן ליצור דרך [@BotFather](https://t.me/BotFather))

---

### 1. שכפול הריפו | Clone the repo

```bash
git clone https://github.com/Idan582/-booking-price-tracker.git
cd booking-price-tracker
```

---

### 2. התקנת תלויות | Install dependencies

```bash
cd backend
npm install
npx playwright install chromium
```

---

### 3. הגדרת משתני סביבה | Set up environment variables

```bash
cp .env.example .env
```

פתח את `.env` ומלא את הפרטים שלך | Open `.env` and fill in your credentials:

```env
# Gmail SMTP — use an App Password, not your regular password
EMAIL_USER=your@gmail.com
EMAIL_PASS=your_app_password_here

# Telegram — create a bot via @BotFather, find your chat_id via getUpdates
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
TELEGRAM_CHAT_ID=your_chat_id_here
```

---

### 4. הרצת השרת | Start the server

```bash
node server.js
```

השרת רץ על `http://localhost:3001` ובודק מחירים כל 2 שעות.  
The server runs on `http://localhost:3001` and checks prices every 2 hours.

---

### 5. טעינת תוסף Chrome | Load the Chrome Extension

1. פתח Chrome ועבור ל `chrome://extensions/`
2. הפעל **Developer mode** (פינה עליונה ימנית)
3. לחץ **Load unpacked** ובחר את תיקיית `extension/`
4. Open Chrome → `chrome://extensions/` → enable **Developer mode** → **Load unpacked** → select the `extension/` folder

---

## שימוש | Usage

1. גש לדף מלון ב-Booking.com עם תאריכים ומספר אורחים
2. בחר חדר — יופיע כפתור **"עקוב אחרי מחיר"**
3. הזן מחיר יעד, מייל ו/או הפעל התראת טלגרם
4. השרת יבדוק כל 2 שעות — ותקבל התראה ברגע שהמחיר יורד

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/track` | הוסף / עדכן מעקב — Add/update tracking |
| `GET` | `/api/track` | רשימת מעקבים — List all tracked hotels |
| `DELETE` | `/api/track/:id` | הסר מעקב — Stop tracking |
| `POST` | `/api/scrape` | הפעל סריקה ידנית — Trigger manual scrape |
| `GET` | `/health` | בדיקת תקינות — Health check |

---

## אבטחה | Security

- **לעולם אל תעלה את קובץ `.env` ל-GitHub** — הוא כולל סיסמאות וטוקנים פרטיים
- קובץ `.gitignore` מוגדר כבר להוציא אותו אוטומטית
- השתמש תמיד ב-App Password של Gmail, לא בסיסמה הרגילה

---

## טכנולוגיות | Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js, Express |
| Scraping | Playwright (headless Chromium) |
| Email | Nodemailer + Gmail SMTP |
| Telegram | Telegraf |
| Scheduler | node-cron |
| Extension | Chrome Extension Manifest V3 |

---

## רישיון | License

MIT

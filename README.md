# Booking.com Price Tracker Bot 🔔

> מעקב אוטומטי אחרי מחירי מלונות ב-Booking.com עם התראות בזמן אמת במייל ובטלגרם

---

## תיאור הפרויקט

כלי שמאפשר לך לעקוב אחרי מחיר חדר ספציפי ב-Booking.com.  
ברגע שהמחיר יורד מתחת ליעד שהגדרת — תקבל התראה מיידית במייל ו/או בטלגרם.  
אם המחיר ימשיך לצנוח לאחר ההתראה הראשונה, תקבל התראת "Double Drop" עם כותרת בוהקת שתדע שזה הזמן לפעול.

---

## תכונות עיקריות

- **תוסף Chrome** — כפתור "עקוב אחרי מחיר" מופיע ישירות על דף המלון ב-Booking.com
- **התראות טלגרם** — הודעה מיידית מהבוט שלך כשהמחיר יורד
- **התראות מייל (Gmail)** — אימייל HTML מעוצב עם קישור ישיר להזמנה
- **שרת Node.js מקומי** — בודק מחירים אוטומטית כל 2 שעות עם Playwright
- **לוגיקת Double Drop** — התראה שנייה עם כותרת "🔥 ירידת מחיר נוספת!" כשהמחיר ממשיך לצנוח

---

## לוגיקת ההתראות

| מצב | כותרת המייל | עיצוב |
|-----|------------|-------|
| ירידה ראשונה מתחת ליעד | `עדכון לגבי המעקב שלך בבוקינג - [מלון]` | כחול רגיל |
| ירידה נוספת מתחת למחיר שכבר נשלחה עליו התראה | `🔥 ירידת מחיר נוספת! המחיר ממשיך לצנוח - [מלון] 📢` | אדום + באנר "חסוך אפילו יותר" |

לאחר כל התראה, `targetPrice` מתעדכן למחיר הנוכחי — כך שהבוט לא ישלח אותה התראה שוב, רק אם המחיר ימשיך לרדת.

---

## ארכיטקטורה

```
booking-price-tracker/
├── backend/
│   ├── server.js          # Express API + cron scheduler (כל 2 שעות)
│   ├── scraper.js         # Playwright scraper + התראות מייל/טלגרם
│   ├── tracked_hotels.json # מסד הנתונים המקומי (לא מועלה ל-Git)
│   ├── .env.example       # תבנית למשתני הסביבה
│   └── package.json
└── extension/
    ├── manifest.json      # הגדרות תוסף Chrome (Manifest V3)
    ├── content.js         # מוזרק לדפי Booking.com
    ├── popup.html         # ממשק פופאפ התוסף
    └── popup.js           # לוגיקת הפופאפ
```

---

## התקנה

### דרישות מקדימות

- [Node.js](https://nodejs.org/) גרסה 18 ומעלה
- Google Chrome
- חשבון Gmail עם [App Password](https://myaccount.google.com/apppasswords) (לא הסיסמה הרגילה שלך)
- בוט טלגרם (ניתן ליצור דרך [@BotFather](https://t.me/BotFather))

---

### 1. שכפול הריפו

```bash
git clone https://github.com/Idan582/-booking-price-tracker.git
cd booking-price-tracker
```

---

### 2. התקנת תלויות

```bash
cd backend
npm install
npx playwright install chromium
```

---

### 3. הגדרת משתני סביבה

```bash
cp .env.example .env
```

פתח את `.env` ומלא את הפרטים שלך:

```env
# Gmail SMTP — השתמש ב-App Password, לא בסיסמה הרגילה
EMAIL_USER=your@gmail.com
EMAIL_PASS=your_app_password_here

# Telegram — צור בוט דרך @BotFather, מצא את chat_id דרך getUpdates
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
TELEGRAM_CHAT_ID=your_chat_id_here
```

---

### 4. הרצת השרת

```bash
node server.js
```

השרת רץ על `http://localhost:3001` ובודק מחירים כל 2 שעות.

---

### 5. טעינת תוסף Chrome

1. פתח Chrome ועבור ל `chrome://extensions/`
2. הפעל **Developer mode** (פינה עליונה ימנית)
3. לחץ **Load unpacked** ובחר את תיקיית `extension/`
4. עבור לדף מלון ב-Booking.com — הכפתור יופיע אוטומטית

---

## שימוש

1. גש לדף מלון ב-Booking.com עם תאריכים ומספר אורחים
2. בחר חדר — יופיע כפתור **"עקוב אחרי מחיר"**
3. הזן מחיר יעד, מייל ו/או הפעל התראת טלגרם ולחץ שמור
4. השרת יבדוק כל 2 שעות — ותקבל התראה ברגע שהמחיר יורד מתחת ליעד

---

## API Endpoints

| Method | Endpoint | תיאור |
|--------|----------|-------|
| `POST` | `/api/track` | הוסף / עדכן מעקב |
| `GET` | `/api/track` | רשימת כל המעקבים הפעילים |
| `DELETE` | `/api/track/:id` | הסר מעקב |
| `POST` | `/api/scrape` | הפעל סריקת מחירים ידנית |
| `GET` | `/health` | בדיקת תקינות השרת |

---

## אבטחה

- **לעולם אל תעלה את קובץ `.env` ל-GitHub** — הוא כולל סיסמאות וטוקנים פרטיים
- קובץ `.gitignore` מוגדר להוציא אוטומטית את `.env`, `node_modules/` ואת `tracked_hotels.json`
- השתמש תמיד ב-App Password של Gmail ולא בסיסמה הרגילה

---

## טכנולוגיות

| שכבה | טכנולוגיה |
|------|-----------|
| Backend | Node.js, Express |
| Scraping | Playwright (headless Chromium) |
| Email | Nodemailer + Gmail SMTP |
| Telegram | Telegraf |
| Scheduler | node-cron |
| Extension | Chrome Extension Manifest V3 |

---

## רישיון

MIT

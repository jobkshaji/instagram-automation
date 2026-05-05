<<<<<<< HEAD
# instagram-automation
Browser automation for Instagram: persistent login, feed screenshots, and searchable saved reels extraction

=======
# Instagram Automation 🎬

Browser automation for Instagram with persistent login, feed screenshots, and intelligent saved reels extraction with full-text search indexing.

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🔐 **Persistent Login** | One-time login, auto-restores session on next use |
| 📸 **Screenshots** | Capture feed, profile, or any page |
| 🎬 **Reels Extraction** | Export saved reels with links, captions, hashtags |
| 🔍 **Smart Indexing** | Full-text search across all saved reels |
| 🏷️ **Auto-Tagging** | Automatic categorization (sports, funny, gym, etc.) |
| ⚡ **Voice Shortcuts** | Auto-trigger workflows with natural phrases |
| 📊 **Statistics** | Track total reels, creators, hashtags |

---

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install
npx playwright install
```

### 2. Configure

Edit `config.js` with your Instagram credentials:

```javascript
module.exports = {
  username: 'your_username',
  password: 'your_password',
  headless: false,  // Set true to hide browser
};
```

### 3. Run

```bash
# Take screenshot
node scripts/instagram-screenshot.js

# Extract saved reels
node scripts/instagram-saved-reels.js

# Sync database
node scripts/quick-import.js
```

---

## 🗣️ Voice Shortcuts (Auto-Trigger)

Say these phrases to trigger workflows **without confirmation**:

| Phrase | Action |
|--------|--------|
| "Update my reel list" | Extract reels + sync database |
| "Show my saved reels" | Display all saved reels |
| "Get my Instagram saved" | Extract + sync latest reels |
| "Find my [keyword] reel" | Search indexed reels |

---

## 📚 Scripts Reference

### Core Scripts

```bash
# Login & Screenshot
node scripts/instagram-screenshot.js [--headless]

# Extract Saved Reels
node scripts/instagram-saved-reels.js [--use-saved]

# Quick Database Import
node scripts/quick-import.js

# Full Index Sync
node scripts/reels-indexer.js sync <username>
```

### Search Commands

```bash
# Search by keyword
node scripts/search-reels.js search <keyword>

# Search by hashtag
node scripts/search-reels.js hashtag <tag>

# Search by creator
node scripts/search-reels.js creator <username>

# Show statistics
node scripts/search-reels.js stats
```

---

## 📁 File Structure

```
instagram-automation/
├── scripts/
│   ├── instagram-screenshot.js      # Login & screenshot
│   ├── instagram-saved-reels.js     # Reels extraction
│   ├── reels-indexer.js             # Database indexer
│   ├── search-reels.js              # Search tool
│   └── quick-import.js              # Fast database import
├── config.js                         # Configuration
├── instagram_screenshot/             # Output directory
│   ├── instagram_auth.json          # Session (auto-generated)
│   ├── instagram_cookies.json       # Cookies (auto-generated)
│   ├── MY_SAVED_REELS.txt           # Extracted reels list
│   ├── reels_database.json          # Indexed database
│   └── reels_index.json             # Search index
└── README.md
```

---

## 🔍 Example Output

### Saved Reels List (MY_SAVED_REELS.txt)
```
Reel #1
Link: https://www.instagram.com/reel/ABC123/
Caption: "Amazing gym workout 💪 #fitness #gym"
Creator: @fitness_guru
Likes: 15.2K | Views: 245K
---
```

### Search Results
```bash
$ node scripts/search-reels.js search gym

Found 3 reels:

1. Amazing gym workout 💪
   Hashtags: #fitness #gym #workout
   Creator: @fitness_guru
   Link: https://www.instagram.com/reel/ABC123/
```

---

## 🔒 Security

**⚠️ IMPORTANT:**

- `instagram_auth.json` and `instagram_cookies.json` contain **session tokens**
- These files are **gitignored** by default
- **Never commit** these files to GitHub
- Store credentials only in `config.js` (also gitignored)

---

## ⚠️ Disclaimer

This tool is for **educational and personal use only**.

Automating Instagram may violate their [Terms of Service](https://help.instagram.com/581066165581870). Use at your own risk. The authors are not responsible for any account restrictions or bans.

---

## 📜 License

[MIT](LICENSE) © 2026

---

## 🤝 Contributing

PRs welcome! Please ensure:
1. Code follows existing style
2. Add tests if applicable
3. Update documentation

---

## 💡 Tips

- **First run:** Will prompt for login, saves session for future runs
- **Scheduled sync:** Set up cron job for daily auto-sync
- **Rate limiting:** Avoid running too frequently to prevent blocks
- **Headless mode:** Set `headless: true` in config for background operation

---

*Built with [Playwright](https://playwright.dev/) and ❤️*
>>>>>>> ae7e87d ( Readme)

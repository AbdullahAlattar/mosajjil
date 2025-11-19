# Mosajjil مسجّل

Video downloader with Arabic interface and dark theme. Works great on mobile.

**Supported:** YouTube • Instagram • TikTok • Twitter/X • Facebook • Vimeo • Reddit

---

## Quick Start

```bash
git clone https://github.com/AbdullahAlattar/mosajjil.git
cd mosajjil
docker-compose up --build -d
```

Open `http://localhost:8080`

For other devices on your network: `http://YOUR_IP:8080`

---

## Features

- Real-time progress with speed and ETA
- Multiple quality options (defaults to 720p)
- iOS compatible (auto-converts Instagram/TikTok/Facebook to H.264)
- Clean dark interface
- No accounts, no tracking

---

## Without Docker

Requires Node.js 16+, yt-dlp, ffmpeg, and aria2.

```bash
npm install
npm start
```

---

## License

MIT

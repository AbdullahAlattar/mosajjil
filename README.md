<p align="center">
  <h1 align="center">Mosajjil مسجّل</h1>
  <p align="center">Fast video downloader with Arabic UI</p>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white" alt="Docker">
  <img src="https://img.shields.io/badge/Node.js-16+-339933?logo=node.js&logoColor=white" alt="Node.js">
  <img src="https://img.shields.io/badge/License-MIT-green" alt="License">
</p>

---

## 📦 Supported Platforms

YouTube • Instagram • TikTok • Twitter/X • Facebook • Vimeo • Reddit

---

## ⚡ Quick Start with Docker

```bash
git clone https://github.com/AbdullahAlattar/mosajjil.git
cd mosajjil
docker-compose up --build -d
```

Open **http://localhost:8080**

Network access: `http://YOUR_IP:8080`

---

## ✨ Features

- **Fast downloads** with concurrent connections
- Real-time progress bar with speed & ETA
- Multiple quality options (defaults to 720p)
- iOS compatible — auto-converts to H.264
- Dark interface, mobile-friendly
- No accounts, no tracking

---

## 🔧 Without Docker

Requires: Node.js 16+, yt-dlp, ffmpeg, aria2

```bash
npm install
npm start
```

---

## 🍪 VPS Note

YouTube/Instagram may block datacenter IPs. If downloads fail, one of the temporary solutions is to add a `cookies.txt` file (exported from your browser thats logged in to youtube and instagram) to the project folder. The app will use it automatically.

---

## 📄 License

MIT — use it however you want!

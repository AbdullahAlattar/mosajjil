const express = require('express');
const cors = require('cors');
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Create downloads directory
const downloadsDir = path.join(__dirname, 'downloads');
if (!fs.existsSync(downloadsDir)) {
  fs.mkdirSync(downloadsDir);
}

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Store active downloads for progress tracking
const activeDownloads = new Map();

// Get yt-dlp path
const ytDlpPath = (() => {
  try {
    return execSync('which yt-dlp 2>/dev/null || echo ~/.local/bin/yt-dlp').toString().trim();
  } catch {
    return 'yt-dlp';
  }
})();

console.log(`Using yt-dlp at: ${ytDlpPath}`);

// Check for cookies file
const cookiesFile = path.join(__dirname, 'cookies.txt');
const cookiesArg = fs.existsSync(cookiesFile) ? `--cookies "${cookiesFile}"` : '';
if (cookiesArg) console.log('Using cookies file for authentication');

// Sanitize URL to prevent command injection
function sanitizeUrl(url) {
  return url.replace(/[;&|`$()]/g, '');
}

// Get video info
app.get('/api/info', async (req, res) => {
  try {
    const url = sanitizeUrl(req.query.url || '');

    if (!url) {
      return res.status(400).json({ error: 'الرابط مطلوب' });
    }

    if (!url.startsWith('http')) {
      return res.status(400).json({ error: 'رابط غير صالح' });
    }

    // Get video info using yt-dlp
    const result = execSync(
      `${ytDlpPath} ${cookiesArg} --dump-json --no-playlist --no-warnings "${url}"`,
      { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, timeout: 30000 }
    );

    const info = JSON.parse(result);

    // Process formats - get video+audio formats
    const formats = [];
    const seenQualities = new Set();

    // Sort formats by quality
    const sortedFormats = (info.formats || [])
      .filter(f => f.vcodec !== 'none' && f.acodec !== 'none' && f.height)
      .sort((a, b) => (b.height || 0) - (a.height || 0));

    for (const format of sortedFormats) {
      const quality = `${format.height}p`;
      if (!seenQualities.has(quality)) {
        seenQualities.add(quality);
        formats.push({
          format_id: format.format_id,
          quality,
          ext: format.ext,
          size: format.filesize
            ? (format.filesize / (1024 * 1024)).toFixed(2) + ' MB'
            : format.filesize_approx
              ? (format.filesize_approx / (1024 * 1024)).toFixed(2) + ' MB'
              : ''
        });
      }
    }

    // Add best quality option
    formats.unshift({
      format_id: 'best',
      quality: 'أعلى جودة',
      ext: 'mp4',
      size: 'تلقائي'
    });

    // Add audio-only option
    formats.push({
      format_id: 'bestaudio',
      quality: 'صوت فقط',
      ext: 'mp3',
      size: 'تلقائي'
    });

    // Get best available thumbnail
    let thumbnail = info.thumbnail;
    if (!thumbnail && info.thumbnails?.length > 0) {
      thumbnail = info.thumbnails[info.thumbnails.length - 1].url;
    }

    res.json({
      title: info.title || 'فيديو',
      thumbnail: thumbnail || '',
      duration: info.duration || 0,
      author: info.uploader || info.channel || info.creator || '',
      formats: formats.slice(0, 8)
    });

  } catch (error) {
    console.error('Error fetching video info:', error.message);
    res.status(500).json({ error: 'فشل جلب معلومات الفيديو. تحقق من الرابط وحاول مرة أخرى.' });
  }
});

// Start download and return download ID
app.post('/api/download/start', async (req, res) => {
  try {
    const url = sanitizeUrl(req.body.url || '');
    const format_id = req.body.format_id;
    const title = req.body.title || 'video';

    if (!url || !format_id) {
      return res.status(400).json({ error: 'الرابط والجودة مطلوبان' });
    }

    // Generate unique download ID
    const downloadId = `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

    // Determine format and extension
    let formatArg, ext;
    if (format_id === 'bestaudio') {
      formatArg = '-f bestaudio --extract-audio --audio-format mp3';
      ext = 'mp3';
    } else if (format_id === 'best') {
      formatArg = '-f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best" --merge-output-format mp4';
      ext = 'mp4';
    } else {
      formatArg = `-f "${format_id}+bestaudio/best" --merge-output-format mp4`;
      ext = 'mp4';
    }

    const tempFile = path.join(downloadsDir, `${downloadId}.${ext}`);

    // Build yt-dlp command
    const cmd = `${ytDlpPath} ${cookiesArg} ${formatArg} --no-playlist --no-warnings --newline --progress-template "%(progress._percent_str)s %(progress._speed_str)s %(progress._eta_str)s" --concurrent-fragments 8 -o "${tempFile}" "${url}"`;

    console.log(`Starting download ${downloadId}`);

    // Initialize download state
    activeDownloads.set(downloadId, {
      status: 'downloading',
      progress: 0,
      speed: '',
      eta: '',
      tempFile,
      ext,
      url,
      title: title.replace(/[^\w\s-]/g, '').substring(0, 100) || 'video',
      error: null
    });

    // Start download process
    const ytdlp = spawn('sh', ['-c', cmd]);

    ytdlp.stdout.on('data', (data) => {
      const match = data.toString().match(/([\d.]+)%\s*(\S*)\s*(\S*)/);
      if (match) {
        const download = activeDownloads.get(downloadId);
        if (download) {
          download.progress = parseFloat(match[1]) || 0;
          download.speed = match[2] || '';
          download.eta = match[3] || '';
        }
      }
    });

    ytdlp.stderr.on('data', (data) => {
      const match = data.toString().match(/([\d.]+)%/);
      if (match) {
        const download = activeDownloads.get(downloadId);
        if (download) {
          download.progress = parseFloat(match[1]) || 0;
        }
      }
    });

    ytdlp.on('close', async (code) => {
      const download = activeDownloads.get(downloadId);
      if (!download) return;

      if (code === 0 && fs.existsSync(tempFile)) {
        // Convert for iOS compatibility (Instagram, TikTok, Facebook)
        const needsConversion = /instagram\.com|tiktok\.com|facebook\.com|fb\.watch/i.test(url);

        if (needsConversion && ext === 'mp4') {
          try {
            download.progress = 95;
            download.speed = 'جاري التحويل...';
            download.eta = '';

            const convertedFile = tempFile.replace('.mp4', '_converted.mp4');

            execSync(
              `ffmpeg -i "${tempFile}" -c:v libx264 -c:a aac -b:a 128k -movflags +faststart -y "${convertedFile}"`,
              { maxBuffer: 50 * 1024 * 1024, timeout: 600000 }
            );

            if (fs.existsSync(convertedFile)) {
              fs.unlinkSync(tempFile);
              fs.renameSync(convertedFile, tempFile);
            }
          } catch (err) {
            console.error('Conversion error:', err.message);
          }
        }

        download.status = 'completed';
        download.progress = 100;
      } else {
        download.status = 'error';
        download.error = 'فشل التحميل';
      }
    });

    ytdlp.on('error', (error) => {
      const download = activeDownloads.get(downloadId);
      if (download) {
        download.status = 'error';
        download.error = error.message;
      }
    });

    res.json({ downloadId });

  } catch (error) {
    console.error('Error starting download:', error.message);
    res.status(500).json({ error: 'فشل بدء التحميل' });
  }
});

// Get download progress (SSE)
app.get('/api/download/progress/:id', (req, res) => {
  const { id } = req.params;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendProgress = () => {
    const download = activeDownloads.get(id);
    if (download) {
      res.write(`data: ${JSON.stringify(download)}\n\n`);

      if (download.status === 'completed' || download.status === 'error') {
        clearInterval(interval);
        res.end();
      }
    } else {
      res.write(`data: ${JSON.stringify({ status: 'not_found' })}\n\n`);
      clearInterval(interval);
      res.end();
    }
  };

  const interval = setInterval(sendProgress, 300);
  sendProgress();

  req.on('close', () => clearInterval(interval));
});

// Get the downloaded file
app.get('/api/download/file/:id', (req, res) => {
  const download = activeDownloads.get(req.params.id);

  if (!download || download.status !== 'completed') {
    return res.status(404).json({ error: 'الملف غير موجود' });
  }

  const { tempFile, ext, title } = download;

  if (!fs.existsSync(tempFile)) {
    return res.status(404).json({ error: 'الملف غير موجود' });
  }

  const stat = fs.statSync(tempFile);

  res.setHeader('Content-Disposition', `attachment; filename="${title}.${ext}"`);
  res.setHeader('Content-Type', ext === 'mp3' ? 'audio/mpeg' : 'video/mp4');
  res.setHeader('Content-Length', stat.size);

  const fileStream = fs.createReadStream(tempFile, { highWaterMark: 1024 * 1024 });
  fileStream.pipe(res);

  fileStream.on('close', () => {
    fs.unlink(tempFile, () => {});
    activeDownloads.delete(req.params.id);
  });
});

// Clean up old downloads every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, download] of activeDownloads) {
    const timestamp = parseInt(id.split('-')[0]);
    if (now - timestamp > 30 * 60 * 1000) {
      if (download.tempFile && fs.existsSync(download.tempFile)) {
        fs.unlink(download.tempFile, () => {});
      }
      activeDownloads.delete(id);
    }
  }
}, 5 * 60 * 1000);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

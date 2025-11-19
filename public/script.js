document.addEventListener('DOMContentLoaded', () => {
  const urlForm = document.getElementById('urlForm');
  const videoUrl = document.getElementById('videoUrl');
  const fetchBtn = document.getElementById('fetchBtn');
  const errorDiv = document.getElementById('error');
  const videoInfo = document.getElementById('videoInfo');
  const thumbnail = document.getElementById('thumbnail');
  const videoTitle = document.getElementById('videoTitle');
  const videoAuthor = document.getElementById('videoAuthor');
  const duration = document.getElementById('duration');
  const formatList = document.getElementById('formatList');
  const downloadBtn = document.getElementById('downloadBtn');

  // Progress elements
  const progressContainer = document.getElementById('progressContainer');
  const progressStatus = document.getElementById('progressStatus');
  const progressPercent = document.getElementById('progressPercent');
  const progressFill = document.getElementById('progressFill');
  const progressSpeed = document.getElementById('progressSpeed');
  const progressEta = document.getElementById('progressEta');

  let currentUrl = '';
  let currentTitle = '';
  let selectedFormatId = '';

  // Format duration from seconds to MM:SS or HH:MM:SS
  function formatDuration(seconds) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  // Show error message
  function showError(message) {
    errorDiv.textContent = message;
    errorDiv.classList.add('show');
    setTimeout(() => {
      errorDiv.classList.remove('show');
    }, 5000);
  }

  // Reset progress UI
  function resetProgress() {
    progressContainer.classList.add('hidden');
    progressFill.style.width = '0%';
    progressPercent.textContent = '0%';
    progressSpeed.textContent = '';
    progressEta.textContent = '';
    progressStatus.textContent = 'جاري التحميل...';
    downloadBtn.classList.remove('downloading');
    downloadBtn.disabled = false;
  }

  // Handle form submission
  urlForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const url = videoUrl.value.trim();
    if (!url) return;

    // Reset state
    errorDiv.classList.remove('show');
    videoInfo.classList.add('hidden');
    resetProgress();
    fetchBtn.classList.add('loading');
    fetchBtn.disabled = true;

    try {
      const response = await fetch(`/api/info?url=${encodeURIComponent(url)}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch video info');
      }

      // Update video info
      currentUrl = url;
      currentTitle = data.title;

      // Handle thumbnail
      if (data.thumbnail) {
        thumbnail.src = data.thumbnail;
        thumbnail.parentElement.style.display = 'block';
      } else {
        thumbnail.parentElement.style.display = 'none';
      }

      videoTitle.textContent = data.title;
      videoAuthor.textContent = data.author;

      // Handle duration
      if (data.duration) {
        duration.textContent = formatDuration(parseInt(data.duration));
        duration.style.display = 'block';
      } else {
        duration.style.display = 'none';
      }

      // Populate format list
      formatList.innerHTML = '';

      // Find 720p option index, fallback to first option
      let defaultIndex = data.formats.findIndex(f => f.quality === '720p');
      if (defaultIndex === -1) defaultIndex = 0;

      data.formats.forEach((format, index) => {
        const option = document.createElement('div');
        option.className = 'format-option';
        const sizeText = format.size && format.size !== 'Unknown' ? format.size : '';
        option.innerHTML = `
          <input type="radio" name="format" id="format-${format.format_id}" value="${format.format_id}" ${index === defaultIndex ? 'checked' : ''}>
          <label for="format-${format.format_id}">
            <span class="format-quality">${format.quality}</span>
            ${sizeText ? `<span class="format-size">${sizeText}</span>` : ''}
          </label>
        `;
        formatList.appendChild(option);
      });

      // Set initial selection
      if (data.formats.length > 0) {
        selectedFormatId = data.formats[defaultIndex].format_id;
        downloadBtn.disabled = false;
      }

      // Show video info
      videoInfo.classList.remove('hidden');

    } catch (error) {
      showError(error.message);
    } finally {
      fetchBtn.classList.remove('loading');
      fetchBtn.disabled = false;
    }
  });

  // Handle format selection
  formatList.addEventListener('change', (e) => {
    if (e.target.type === 'radio') {
      selectedFormatId = e.target.value;
      downloadBtn.disabled = false;
    }
  });

  // Handle download
  downloadBtn.addEventListener('click', async () => {
    if (!currentUrl || !selectedFormatId) return;

    // Disable button and show progress
    downloadBtn.disabled = true;
    downloadBtn.classList.add('downloading');
    progressContainer.classList.remove('hidden');
    progressStatus.textContent = 'جاري بدء التحميل...';

    try {
      // Start the download
      const startResponse = await fetch('/api/download/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          url: currentUrl,
          format_id: selectedFormatId,
          title: currentTitle
        })
      });

      const startData = await startResponse.json();

      if (!startResponse.ok) {
        throw new Error(startData.error || 'Failed to start download');
      }

      const downloadId = startData.downloadId;

      // Listen to progress updates via SSE
      const eventSource = new EventSource(`/api/download/progress/${downloadId}`);

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.status === 'downloading') {
          progressStatus.textContent = 'جاري التحميل...';
          const percent = Math.round(data.progress);
          progressPercent.textContent = `${percent}%`;
          progressFill.style.width = `${percent}%`;

          if (data.speed) {
            progressSpeed.textContent = `السرعة: ${data.speed}`;
          }
          if (data.eta && data.eta !== 'Unknown') {
            progressEta.textContent = `الوقت المتبقي: ${data.eta}`;
          }
        } else if (data.status === 'completed') {
          eventSource.close();
          progressStatus.textContent = 'اكتمل! جاري حفظ الملف...';
          progressPercent.textContent = '100%';
          progressFill.style.width = '100%';

          // Trigger file download
          const a = document.createElement('a');
          a.href = `/api/download/file/${downloadId}`;
          a.style.display = 'none';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);

          // Clear input field and reset UI after a short delay
          setTimeout(() => {
            videoUrl.value = '';
            videoInfo.classList.add('hidden');
            resetProgress();
          }, 2000);
        } else if (data.status === 'error') {
          eventSource.close();
          showError(data.error || 'فشل التحميل');
          resetProgress();
        } else if (data.status === 'not_found') {
          eventSource.close();
          showError('جلسة التحميل غير موجودة');
          resetProgress();
        }
      };

      eventSource.onerror = () => {
        eventSource.close();
        showError('انقطع الاتصال. حاول مرة أخرى.');
        resetProgress();
      };

    } catch (error) {
      showError(error.message);
      resetProgress();
    }
  });

  // Handle paste from clipboard on mobile
  videoUrl.addEventListener('focus', async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        const supportedDomains = [
          'youtube.com', 'youtu.be',
          'instagram.com',
          'tiktok.com',
          'twitter.com', 'x.com',
          'facebook.com', 'fb.watch',
          'vimeo.com',
          'reddit.com'
        ];
        const hasVideoLink = supportedDomains.some(domain => text.includes(domain));
        if (text && hasVideoLink) {
          if (videoUrl.value === '' && confirm('هل تريد لصق الرابط من الحافظة؟')) {
            videoUrl.value = text;
          }
        }
      }
    } catch (err) {
      // Clipboard access denied, ignore
    }
  });
});

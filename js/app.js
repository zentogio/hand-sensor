// ════════════════════════════════════════════════
//  Main Application Logic
// ════════════════════════════════════════════════

const db       = new GestureDB();
const bg       = new ParticleBackground('bg-canvas');
const arManager = new ARImageManager();
let detector   = null;
let pendingFile = null;
let lastGesture = 'none';
let waitingCount = 0;
let isReceiving  = false;

// ── DOM refs ──────────────────────────────────
const $ = id => document.getElementById(id);
const statusDot    = $('status-dot');
const statusText   = $('status-text');
const gestureLabel = $('gesture-label');
const gestureIcon  = $('gesture-icon');
const uploadZone   = $('upload-zone');
const fileInput    = $('file-input');
const previewImg   = $('preview-img');
const previewBox   = $('preview-box');
const receiveBox   = $('receive-box');
const receivedImg  = $('received-img');
const receivedMeta = $('received-meta');
const queueBadge   = $('queue-badge');
const camToggle    = $('cam-toggle');
const feedList     = $('feed-list');
const toast        = $('toast');
const shelfItems   = $('ar-shelf-items');

// ── Toast ─────────────────────────────────────
function showToast(msg, type = 'info') {
  toast.textContent = msg;
  toast.className   = `toast show ${type}`;
  setTimeout(() => toast.classList.remove('show'), 3500);
}

// ── Connection status ─────────────────────────
function setConnected(ok) {
  statusDot.className  = ok ? 'dot green' : 'dot red';
  statusText.textContent = ok ? 'Connected' : 'Offline';
}

// ── Gesture UI update ─────────────────────────
const GESTURE_MAP = {
  fist:      { icon: '✊', label: 'FIST — Upload ready', color: '#ff4444', bgColor: '#ff444422' },
  open_palm: { icon: '🖐', label: 'OPEN PALM — Receiving...', color: '#44ff88', bgColor: '#44ff8822' },
  peace:     { icon: '✌️',  label: 'PEACE',  color: '#4488ff', bgColor: '#4488ff22' },
  other:     { icon: '🤚', label: 'Gesture detected',  color: '#aaaaaa', bgColor: '#aaaaaa11' },
  none:      { icon: '👋', label: 'Show your hand',    color: '#666666', bgColor: 'transparent' }
};

function updateGestureUI(g) {
  const m = GESTURE_MAP[g] || GESTURE_MAP.none;
  gestureIcon.textContent = m.icon;
  gestureLabel.textContent = m.label;
  gestureLabel.style.color = m.color;
  document.querySelector('.camera-box').style.boxShadow =
    `0 0 30px ${m.color}55`;
  bg.setColor(m.color === '#666666' ? '#334488' : m.color);
}

// ── File upload area ──────────────────────────
uploadZone.addEventListener('dragover', e => {
  e.preventDefault();
  uploadZone.classList.add('drag-over');
});
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
uploadZone.addEventListener('drop', e => {
  e.preventDefault();
  uploadZone.classList.remove('drag-over');
  handleFile(e.dataTransfer.files[0]);
});
uploadZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => handleFile(fileInput.files[0]));

function handleFile(file) {
  if (!file || !file.type.startsWith('image/')) {
    showToast('Please select an image file', 'error'); return;
  }
  pendingFile = file;
  const url = URL.createObjectURL(file);
  previewImg.src = url;
  previewBox.classList.add('has-image');
  uploadZone.querySelector('p').textContent = `📸 ${file.name} — Show FIST to send`;
  showToast('Image ready! Show a ✊ FIST to upload', 'info');
}

// ── Gesture handler ───────────────────────────
async function onGesture(g) {
  if (g === lastGesture) return;
  lastGesture = g;
  updateGestureUI(g);

  // ✊ FIST → upload pending image
  if (g === 'fist' && pendingFile) {
    await sendImage();
  }

  // 🖐 OPEN PALM → receive image
  if (g === 'open_palm' && !isReceiving && waitingCount > 0) {
    await receiveImage();
  }
}

async function sendImage() {
  if (!pendingFile) return;
  showToast('⬆️ Uploading...', 'info');
  uploadZone.classList.add('uploading');
  try {
    const { id, url } = await db.uploadImage(pendingFile);
    showToast('✅ Image sent! Waiting for receiver...', 'success');
    pendingFile = null;
    previewBox.classList.remove('has-image');
    uploadZone.querySelector('p').textContent = 'Drag & drop or click to select image';
    previewImg.src = '';
  } catch (err) {
    console.error(err);
    showToast('❌ Upload failed: ' + err.message, 'error');
  } finally {
    uploadZone.classList.remove('uploading');
  }
}

async function receiveImage() {
  isReceiving = true;
  showToast('📥 Fetching image...', 'info');
  try {
    const img = await db.claimImage();
    if (!img) {
      showToast('No images waiting', 'info');
      isReceiving = false;
      return;
    }
    displayReceived(img);
    showToast('🎉 Image received!', 'success');
  } catch (err) {
    console.error(err);
    showToast('❌ Receive failed: ' + err.message, 'error');
  }
  setTimeout(() => { isReceiving = false; }, 2000);
}

function displayReceived(img) {
  receivedImg.src = img.imageUrl;
  receivedImg.onload = () => {
    receiveBox.classList.add('visible');
    receiveBox.classList.add('animate-in');
    setTimeout(() => receiveBox.classList.remove('animate-in'), 800);
  };
  receivedMeta.textContent =
    `From ${img.userName || 'Unknown'} · ${timeAgo(img.uploadedAt?.toDate?.() || new Date())}`;

  // ── AR: ใส่รูปไว้ที่มือ ──────────────────────
  if (detector) {
    arManager.receive(img.imageUrl);
    showToast('✌️ Pinch to grab the image!', 'info');
  }
}

// ── Cam Shelf toggle ─────────────────────────
const camShelfBtn   = $('cam-shelf-btn');
const camShelfPanel = $('cam-shelf-panel');
const camShelfClose = $('cam-shelf-close');
const shelfBadge    = $('shelf-badge');

camShelfBtn.addEventListener('click', () => {
  camShelfPanel.classList.toggle('open');
  camShelfBtn.classList.toggle('has-items');
});
camShelfClose.addEventListener('click', () => {
  camShelfPanel.classList.remove('open');
});

function updateShelfBadge(count) {
  if (count > 0) {
    shelfBadge.textContent = count;
    shelfBadge.style.display = 'flex';
    camShelfBtn.classList.add('has-items');
  } else {
    shelfBadge.style.display = 'none';
    camShelfBtn.classList.remove('has-items');
  }
}

// ── AR Shelf render ───────────────────────────
function renderShelf(images) {
  updateShelfBadge(images.length);
  if (!images.length) {
    shelfItems.innerHTML = '<span class="cam-shelf-empty">No saved images yet<br/>✌️ Pinch → drag to shelf</span>';
    return;
  }
  shelfItems.innerHTML = images.map((img, i) => `
    <div class="ar-shelf-thumb new-in" style="animation-delay:${i*0.05}s"
         onclick="downloadShelfImage('${img.src}', ${img.time})">
      <img src="${img.src}" alt="saved"/>
      <div class="dl-btn">↓ SAVE</div>
    </div>
  `).join('');
}

function downloadShelfImage(src, time) {
  const a = document.createElement('a');
  a.href     = src;
  a.download = `gesture-${time}.jpg`;
  a.click();
}

// ── AR Manager callbacks ──────────────────────
arManager.onSaved = (images) => {
  renderShelf(images);
  showToast('📁 Saved to shelf!', 'success');
};
arManager.onDeleted = () => {
  showToast('🗑️ Image deleted', 'error');
};

// ── Activity feed ─────────────────────────────
function renderFeed(items) {
  feedList.innerHTML = items.slice(0, 12).map(item => `
    <div class="feed-item ${item.status}">
      <img src="${item.imageUrl}" alt="img" onerror="this.style.display='none'">
      <div>
        <span class="feed-user">${item.userName || 'Unknown'}</span>
        <span class="feed-status badge-${item.status}">${item.status.toUpperCase()}</span>
        <span class="feed-time">${timeAgo(item.uploadedAt?.toDate?.() || new Date())}</span>
      </div>
    </div>
  `).join('');
}

// ── Camera toggle ─────────────────────────────
camToggle.addEventListener('click', async () => {
  if (detector) {
    detector.stop();
    detector = null;
    camToggle.textContent = '📷 Enable Camera';
    camToggle.classList.remove('active');
    updateGestureUI('none');
  } else {
    camToggle.textContent = '⏳ Starting...';
    detector = new GestureDetector(
      $('video'), $('hand-canvas'), onGesture
    );
    try {
      await detector.init();
      camToggle.textContent = '⏹ Disable Camera';
      camToggle.classList.add('active');
      showToast('Camera started ✅', 'success');

      // ── เชื่อม AR Manager กับ detector ──────────
      detector.onFrame = (lm, gesture, isPinching) => {
        arManager.update(lm, gesture, isPinching,
          detector.canvas.width, detector.canvas.height);
      };
      detector.drawOverlay = (ctx, W, H) => {
        arManager.draw(ctx, W, H);
      };
    } catch (e) {
      showToast('Camera error: ' + e.message, 'error');
      detector = null;
      camToggle.textContent = '📷 Enable Camera';
    }
  }
});

// ── Time helper ───────────────────────────────
function timeAgo(date) {
  if (!date) return '';
  const s = Math.floor((Date.now() - date) / 1000);
  if (s < 60)  return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s/60)}m ago`;
  return `${Math.floor(s/3600)}h ago`;
}

// ── Boot ──────────────────────────────────────
(async () => {
  try {
    await db.signIn();
    setConnected(true);
    showToast('🔐 Signed in anonymously', 'success');

    db.onWaitingCount(n => {
      waitingCount = n;
      queueBadge.textContent = n;
      queueBadge.style.display = n > 0 ? 'inline-flex' : 'none';
    });

    db.onStatusChange(renderFeed);

  } catch (e) {
    setConnected(false);
    showToast('🔴 Connection failed — check Firebase config', 'error');
    console.error(e);
  }
})();

// ════════════════════════════════════════════════
//  Hand Gesture Detection — MediaPipe Hands
//  รองรับทั้ง Desktop และ Mobile
// ════════════════════════════════════════════════

class GestureDetector {
  constructor(videoEl, canvasEl, onGesture) {
    this.video      = videoEl;
    this.canvas     = canvasEl;
    this.ctx        = canvasEl.getContext('2d');
    this.onGesture  = onGesture;
    this.currentGesture = 'none';
    this.gestureBuffer  = [];
    this.BUFFER_SIZE    = 8;
    this.camera         = null;
    this.hands          = null;
    this.isMobile       = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

    // AR hooks — ตั้งค่าจาก app.js หลัง init()
    this.onFrame     = null;   // (lm, gesture, isPinching) => void
    this.drawOverlay = null;   // (ctx, W, H) => void
  }

  _isPinching(lm) {
    const dx = lm[4].x - lm[8].x;
    const dy = lm[4].y - lm[8].y;
    return Math.sqrt(dx*dx + dy*dy) < 0.06;
  }

  _fingerStates(lm) {
    const tip  = [4, 8, 12, 16, 20];
    const pip  = [3, 7, 11, 15, 19];
    const states = [];
    // Thumb
    states.push(lm[tip[0]].x < lm[pip[0]].x);
    // 4 fingers
    for (let i = 1; i < 5; i++)
      states.push(lm[tip[i]].y < lm[pip[i]].y);
    return states;
  }

  _classify(lm) {
    const s     = this._fingerStates(lm);
    const count = s.filter(Boolean).length;
    if (count === 0) return 'fist';
    if (count >= 4)  return 'open_palm';
    if (!s[0] && s[1] && s[2] && !s[3] && !s[4]) return 'peace';
    return 'other';
  }

  _stableGesture(g) {
    this.gestureBuffer.push(g);
    if (this.gestureBuffer.length > this.BUFFER_SIZE)
      this.gestureBuffer.shift();
    const counts = {};
    this.gestureBuffer.forEach(v => counts[v] = (counts[v] || 0) + 1);
    return Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
  }

  _drawHand(lm, gesture) {
    const W = this.canvas.width, H = this.canvas.height;
    const ctx = this.ctx;
    const CONNECTIONS = [
      [0,1],[1,2],[2,3],[3,4],
      [0,5],[5,6],[6,7],[7,8],
      [0,9],[9,10],[10,11],[11,12],
      [0,13],[13,14],[14,15],[15,16],
      [0,17],[17,18],[18,19],[19,20],
      [5,9],[9,13],[13,17]
    ];
    const color = gesture === 'fist'      ? '#ff4444'
                : gesture === 'open_palm' ? '#44ff88'
                : '#4488ff';

    ctx.strokeStyle = color; ctx.lineWidth = 2;
    CONNECTIONS.forEach(([a, b]) => {
      ctx.beginPath();
      ctx.moveTo(lm[a].x * W, lm[a].y * H);
      ctx.lineTo(lm[b].x * W, lm[b].y * H);
      ctx.stroke();
    });
    lm.forEach((pt, i) => {
      ctx.beginPath();
      ctx.arc(pt.x * W, pt.y * H, i === 0 ? 7 : 4, 0, Math.PI * 2);
      ctx.fillStyle = color; ctx.fill();
    });
    ctx.font = 'bold 16px Inter,sans-serif';
    ctx.fillStyle = color;
    ctx.fillText(gesture.replace('_',' ').toUpperCase(),
      lm[0].x * W + 10, lm[0].y * H - 10);
  }

  async init() {
    this.hands = new Hands({
      locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`
    });
    this.hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.7,
      minTrackingConfidence:  0.6
    });

    this.hands.onResults(results => {
      const c = this.canvas;
      c.width  = this.video.videoWidth  || 640;
      c.height = this.video.videoHeight || 480;
      const ctx = this.ctx;

      ctx.clearRect(0, 0, c.width, c.height);
      // Mirror (selfie view)
      ctx.save();
      ctx.scale(-1, 1);
      ctx.translate(-c.width, 0);
      ctx.drawImage(results.image, 0, 0, c.width, c.height);
      ctx.restore();

      if (results.multiHandLandmarks?.length > 0) {
        const lm = results.multiHandLandmarks[0].map(p => ({
          x: 1 - p.x, y: p.y, z: p.z
        }));
        const raw        = this._classify(lm);
        const stable     = this._stableGesture(raw);
        const isPinching = this._isPinching(lm);

        if (stable !== this.currentGesture) {
          this.currentGesture = stable;
          this.onGesture(stable);
        }

        // ส่งข้อมูล frame ให้ AR manager ทุก frame
        if (this.onFrame) this.onFrame(lm, stable, isPinching);

        this._drawHand(lm, stable);

        // วาด AR overlay ทับ
        if (this.drawOverlay) this.drawOverlay(ctx, c.width, c.height);
      } else {
        this._stableGesture('none');
        if (this.currentGesture !== 'none') {
          this.currentGesture = 'none';
          this.onGesture('none');
        }
      }
    });

    // ── Camera constraints (front for mobile, default for desktop) ──
    const constraints = {
      video: {
        facingMode: 'user',          // front camera (mobile & desktop)
        width:  { ideal: this.isMobile ? 480 : 640 },
        height: { ideal: this.isMobile ? 640 : 480 }
      }
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    this.video.srcObject = stream;
    await this.video.play();

    this.camera = new Camera(this.video, {
      onFrame: async () => { await this.hands.send({ image: this.video }); },
      width:  this.isMobile ? 480 : 640,
      height: this.isMobile ? 640 : 480
    });
    await this.camera.start();
  }

  stop() {
    this.camera?.stop();
    if (this.video.srcObject)
      this.video.srcObject.getTracks().forEach(t => t.stop());
  }
}

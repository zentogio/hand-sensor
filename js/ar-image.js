// ════════════════════════════════════════════════
//  AR Image Manager
//  จัดการรูปที่ติดมือ → จีบเพื่อหยิบ → เลื่อนไปชั้น/ลบ
// ════════════════════════════════════════════════

class ARImageManager {
  constructor() {
    this.state    = 'idle'; // idle | anchored | grabbed
    this.img      = null;
    this.imgSrc   = null;
    this.palmX    = 0;
    this.palmY    = 0;
    this.dropping = false;
    this.pulse    = 0;
    this.savedImages  = [];
    this.particles    = [];
    this.saveParticles = [];

    // Callbacks
    this.onSaved   = null;
    this.onDeleted = null;

    // Debounce release (ป้องกัน flicker)
    this._releaseFrames = 0;
    this.RELEASE_FRAMES = 5;
  }

  // ── Public API ──────────────────────────────────

  receive(imgSrc) {
    const img = new Image();
    img.src   = imgSrc;
    this.img    = img;
    this.imgSrc = imgSrc;
    this.state  = 'anchored';
    this.pulse  = 0;
  }

  /**
   * เรียกทุก frame จาก gesture.js
   * lm = landmarks (x,y normalized, already mirrored)
   */
  update(lm, gesture, isPinching, W, H) {
    if (!lm) return;

    // Palm center = landmark 9 (middle finger MCP)
    this.palmX = lm[9].x * W;
    this.palmY = lm[9].y * H;

    // Drop zone = bottom 25% of canvas
    const inDrop = lm[9].y > 0.72;

    if (this.state === 'idle') {
      // Animate delete particles even when idle
    } else if (this.state === 'anchored') {
      if (isPinching) {
        this.state = 'grabbed';
        this._releaseFrames = 0;
      }
    } else if (this.state === 'grabbed') {
      this.dropping = inDrop;

      if (isPinching) {
        this._releaseFrames = 0;
      } else {
        this._releaseFrames++;
      }

      // Fist = delete (ตรวจ gesture stable)
      if (gesture === 'fist') {
        this._delete();
        return;
      }

      // Release pinch (debounced)
      if (this._releaseFrames >= this.RELEASE_FRAMES) {
        if (inDrop) {
          this._save();
        } else {
          this.state = 'anchored'; // คืนสถานะ
        }
        this._releaseFrames = 0;
      }
    }

    this.pulse += 0.07;
  }

  // ── Canvas Drawing ───────────────────────────────

  draw(ctx, W, H) {
    // วาด particles เสมอ (เอฟเฟกต์หลังลบ)
    this._drawParticles(ctx);
    this._drawSaveParticles(ctx);

    if (this.state === 'idle' || !this.img?.complete) return;

    const iW = 140, iH = 105;
    const ix = this.palmX - iW / 2;
    const iy = this.palmY - iH - 36;
    const sin = Math.sin(this.pulse);

    ctx.save();

    if (this.state === 'anchored') {
      const a = 0.6 + 0.4 * Math.abs(sin);

      // รูปภาพ
      ctx.globalAlpha = a;
      ctx.drawImage(this.img, ix, iy, iW, iH);

      // กรอบ pulse
      ctx.strokeStyle = `rgba(233,255,84,${a})`;
      ctx.lineWidth   = 2;
      ctx.strokeRect(ix, iy, iW, iH);

      // corner accents
      const cLen = 10;
      ctx.strokeStyle = '#E9FF54';
      ctx.lineWidth   = 3;
      [[ix,iy],[ix+iW,iy],[ix,iy+iH],[ix+iW,iy+iH]].forEach(([cx,cy],i) => {
        const sx = i%2===0?1:-1, sy = i<2?1:-1;
        ctx.beginPath();
        ctx.moveTo(cx+sx*cLen,cy); ctx.lineTo(cx,cy); ctx.lineTo(cx,cy+sy*cLen);
        ctx.stroke();
      });

      // Label
      ctx.globalAlpha = a;
      ctx.font        = 'bold 10px "IBM Plex Mono", monospace';
      ctx.fillStyle   = '#E9FF54';
      ctx.textAlign   = 'center';
      ctx.fillText('✌️ PINCH TO GRAB', this.palmX, iy - 8);

    } else if (this.state === 'grabbed') {
      // Drop zone highlight
      if (this.dropping) {
        ctx.globalAlpha = 1;
        ctx.fillStyle   = 'rgba(57,255,133,0.10)';
        ctx.fillRect(0, H*0.72, W, H*0.28);
        ctx.strokeStyle = 'rgba(57,255,133,0.55)';
        ctx.lineWidth   = 2;
        ctx.setLineDash([8, 5]);
        ctx.strokeRect(2, H*0.72+2, W-4, H*0.28-4);
        ctx.setLineDash([]);
        ctx.font      = 'bold 12px "IBM Plex Mono", monospace';
        ctx.fillStyle = '#39FF85';
        ctx.textAlign = 'center';
        ctx.fillText('✋ OPEN PALM = SAVE', W/2, H*0.72+28);
      }

      // รูปภาพ + glow
      ctx.globalAlpha  = 0.92;
      ctx.shadowColor  = this.dropping ? 'rgba(57,255,133,0.6)' : 'rgba(233,255,84,0.5)';
      ctx.shadowBlur   = 18;
      ctx.drawImage(this.img, ix, iy, iW, iH);
      ctx.shadowBlur   = 0;

      // กรอบ
      ctx.strokeStyle = this.dropping ? '#39FF85' : '#E9FF54';
      ctx.lineWidth   = 2;
      ctx.strokeRect(ix, iy, iW, iH);

      // Label
      ctx.font      = 'bold 10px "IBM Plex Mono", monospace';
      ctx.fillStyle = this.dropping ? '#39FF85' : '#E9FF54';
      ctx.textAlign = 'center';
      ctx.fillText(
        this.dropping ? 'OPEN → SAVE  |  ✊ FIST → DEL'
                      : '✊ FIST = DELETE',
        this.palmX, iy - 8
      );
    }

    ctx.restore();
  }

  // ── Internals ────────────────────────────────────

  _save() {
    // Spawn save sparkles
    for (let i = 0; i < 20; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 2 + Math.random() * 5;
      this.saveParticles.push({
        x: this.palmX, y: this.palmY - 50,
        vx: Math.cos(a)*spd, vy: Math.sin(a)*spd - 3,
        life: 1.0, color: i%2===0 ? '#E9FF54' : '#39FF85'
      });
    }

    this.savedImages.push({ src: this.imgSrc, time: Date.now() });
    if (this.onSaved) this.onSaved([...this.savedImages]);
    this._reset();
  }

  _delete() {
    // Spawn red particles
    for (let i = 0; i < 22; i++) {
      const a = (Math.PI*2*i)/22 + Math.random()*0.3;
      const spd = 3 + Math.random() * 5;
      this.particles.push({
        x: this.palmX, y: this.palmY - 50,
        vx: Math.cos(a)*spd, vy: Math.sin(a)*spd,
        life: 1.0
      });
    }
    if (this.onDeleted) this.onDeleted();
    this.imgSrc = null;
    this.img    = null;
    this.state  = 'idle';
  }

  _drawParticles(ctx) {
    if (!this.particles.length) return;
    ctx.save();
    this.particles = this.particles.filter(p => p.life > 0);
    this.particles.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      p.vy += 0.4; p.life -= 0.045;
      ctx.globalAlpha = p.life;
      ctx.fillStyle   = '#FF2D6F';
      const s = 4 * p.life;
      ctx.fillRect(p.x - s/2, p.y - s/2, s, s);
    });
    ctx.restore();
  }

  _drawSaveParticles(ctx) {
    if (!this.saveParticles.length) return;
    ctx.save();
    this.saveParticles = this.saveParticles.filter(p => p.life > 0);
    this.saveParticles.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      p.vy += 0.2; p.life -= 0.035;
      ctx.globalAlpha = p.life;
      ctx.fillStyle   = p.color;
      const s = 5 * p.life;
      ctx.beginPath();
      ctx.arc(p.x, p.y, s/2, 0, Math.PI*2);
      ctx.fill();
    });
    ctx.restore();
  }

  _reset() {
    this.state  = 'idle';
    this.img    = null;
    this.imgSrc = null;
    this.dropping = false;
    this._releaseFrames = 0;
  }
}

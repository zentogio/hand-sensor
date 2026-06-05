// ════════════════════════════════════════════════
//  Three.js Particle Background
// ════════════════════════════════════════════════

class ParticleBackground {
  constructor(canvasId) {
    this.canvas   = document.getElementById(canvasId);
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true });
    this.scene    = new THREE.Scene();
    this.camera   = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    this.camera.position.z = 30;
    this.clock    = new THREE.Clock();
    this._color   = new THREE.Color(0x4488ff);
    this._build();
    this._resize();
    window.addEventListener('resize', () => this._resize());
    this._animate();
  }

  _build() {
    const N    = 1800;
    const geo  = new THREE.BufferGeometry();
    const pos  = new Float32Array(N * 3);
    const col  = new Float32Array(N * 3);

    for (let i = 0; i < N; i++) {
      pos[i*3]   = (Math.random() - 0.5) * 120;
      pos[i*3+1] = (Math.random() - 0.5) * 120;
      pos[i*3+2] = (Math.random() - 0.5) * 80;
      col[i*3]   = 0.2 + Math.random() * 0.4;
      col[i*3+1] = 0.3 + Math.random() * 0.5;
      col[i*3+2] = 0.8 + Math.random() * 0.2;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color',    new THREE.BufferAttribute(col, 3));

    const mat = new THREE.PointsMaterial({
      size: 0.35, vertexColors: true, transparent: true, opacity: 0.7
    });

    this.particles = new THREE.Points(geo, mat);
    this.scene.add(this.particles);
  }

  _resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setColor(hexColor) {
    this._color.set(hexColor);
    const col  = this.particles.geometry.attributes.color;
    const base = this._color;
    for (let i = 0; i < col.count; i++) {
      col.setXYZ(i,
        base.r * (0.5 + Math.random() * 0.5),
        base.g * (0.5 + Math.random() * 0.5),
        base.b * (0.5 + Math.random() * 0.5)
      );
    }
    col.needsUpdate = true;
  }

  _animate() {
    requestAnimationFrame(() => this._animate());
    const t = this.clock.getElapsedTime();
    this.particles.rotation.y = t * 0.04;
    this.particles.rotation.x = t * 0.02;
    this.renderer.render(this.scene, this.camera);
  }
}

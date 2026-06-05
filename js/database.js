// ════════════════════════════════════════════════
//  Firebase Database Operations
//  ใช้แค่ Firestore อย่างเดียว (ไม่ต้อง Storage)
// ════════════════════════════════════════════════

class GestureDB {
  constructor() {
    firebase.initializeApp(FIREBASE_CONFIG);
    this.db       = firebase.firestore();
    this.auth     = firebase.auth();
    this.userId   = null;
    this.userName = null;
    this._listeners = [];
  }

  // ── Sign in anonymously ────────────────────────
  async signIn() {
    const cred    = await this.auth.signInAnonymously();
    this.userId   = cred.user.uid;
    this.userName = 'User_' + this.userId.slice(0, 6).toUpperCase();
    return this.userId;
  }

  // ── แปลงไฟล์เป็น base64 ──────────────────────
  _toBase64(file) {
    return new Promise((res, rej) => {
      // ลดขนาดรูปก่อน upload (max 800px)
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const MAX = 800;
        let w = img.width, h = img.height;
        if (w > MAX || h > MAX) {
          if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
          else       { w = Math.round(w * MAX / h); h = MAX; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        res(canvas.toDataURL('image/jpeg', 0.75));
        URL.revokeObjectURL(url);
      };
      img.onerror = rej;
      img.src = url;
    });
  }

  // ── Upload image → Firestore ───────────────────
  async uploadImage(file) {
    const base64 = await this._toBase64(file);
    const id     = crypto.randomUUID();

    await this.db.collection('images').doc(id).set({
      id,
      userId:      this.userId,
      userName:    this.userName,
      imageData:   base64,           // เก็บรูปตรงใน Firestore
      fileName:    file.name,
      uploadedAt:  firebase.firestore.FieldValue.serverTimestamp(),
      status:      'waiting',
      gestureType: 'closed_fist',
      deliveredTo: null,
      deliveredAt: null
    });

    return { id, url: base64 };
  }

  // ── Claim image (transaction) ──────────────────
  async claimImage() {
    return this.db.runTransaction(async tx => {
      const snap = await this.db.collection('images')
        .where('status', '==', 'waiting')
        .orderBy('uploadedAt', 'asc')
        .limit(1)
        .get();

      if (snap.empty) return null;

      const doc = snap.docs[0];
      const ref = this.db.collection('images').doc(doc.id);
      const cur = await tx.get(ref);
      if (cur.data().status !== 'waiting') return null;

      tx.update(ref, {
        status:      'delivered',
        deliveredTo: this.userId,
        deliveredAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      return { id: doc.id, ...cur.data() };
    });
  }

  // ── Real-time feed ─────────────────────────────
  onStatusChange(callback) {
    const unsub = this.db.collection('images')
      .orderBy('uploadedAt', 'desc')
      .limit(15)
      .onSnapshot(snap => {
        const items = snap.docs.map(d => {
          const data = d.data();
          return {
            id:        d.id,
            imageUrl:  data.imageData,   // base64
            userName:  data.userName,
            status:    data.status,
            uploadedAt: data.uploadedAt
          };
        });
        callback(items);
      });
    this._listeners.push(unsub);
    return unsub;
  }

  // ── Waiting count ──────────────────────────────
  onWaitingCount(callback) {
    const unsub = this.db.collection('images')
      .where('status', '==', 'waiting')
      .onSnapshot(snap => callback(snap.size));
    this._listeners.push(unsub);
    return unsub;
  }

  disconnect() { this._listeners.forEach(fn => fn()); }
}

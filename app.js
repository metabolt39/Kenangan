// Lapisan sambungan: Firebase (log masuk Google + Firestore) dan cuaca/carian tempat percuma.
import { firebaseConfig } from './firebase-config.js';

const V = '10.14.1';
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const gate = (html) => { $('gate').hidden = false; $('gate-c').innerHTML = '<img src="icon-180.png" alt=""><h1>Kenangan Keluarga Ahmad</h1>' + html; };
const hideGate = () => { $('gate').hidden = true; };

/* ---------- cuaca dan tempat (tanpa kunci API) ---------- */
const WMO = c => {
  if (c === 0) return [1, 'Sunny'];
  if (c === 1) return [2, 'Mostly sunny'];
  if (c === 2) return [3, 'Partly sunny'];
  if (c === 3) return [7, 'Cloudy'];
  if (c === 45 || c === 48) return [11, 'Fog'];
  if ((c >= 51 && c <= 67) || (c >= 80 && c <= 82)) return [18, 'Rain'];
  if (c >= 95) return [15, 'Thunderstorms'];
  if ((c >= 71 && c <= 77) || c === 85 || c === 86) return [22, 'Snow'];
  return [7, 'Cloudy'];
};
const geoCache = new Map();
const mcp = {
  async callTool(server, tool, input) {
    const q = (input && input.queryParams) || {};
    if (tool === 'widgets-search-claude') {
      const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=my&accept-language=ms&q=' + encodeURIComponent(q.query || '');
      const r = await fetch(url);
      if (!r.ok) throw { code: 'upstream_error' };
      const a = await r.json();
      return { payload: { results: a.slice(0, 1).map(x => ({ name: x.display_name, locationKey: x.lat + ',' + x.lon })) } };
    }
    if (tool === 'widgets-current-claude') {
      const p = String(q.locationKey || '').split(',');
      const lat = parseFloat(p[0]), lon = parseFloat(p[1]);
      if (!isFinite(lat) || !isFinite(lon)) throw { code: 'bad_request' };
      const r = await fetch('https://api.open-meteo.com/v1/forecast?current=temperature_2m,weather_code,is_day&timezone=auto&latitude=' + lat + '&longitude=' + lon);
      if (!r.ok) throw { code: 'upstream_error' };
      const j = await r.json(), c = j.current || {}, w = WMO(c.weather_code);
      return { payload: { currentConditions: { iconCode: w[0], phrase: w[1], isDayTime: c.is_day !== 0, temperatureValue: c.temperature_2m }, location: { info: { latitude: lat, longitude: lon, countryId: 'MY' } } } };
    }
    throw { code: 'bad_request' };
  }
};

/* ---------- Firebase ---------- */
try { const k = new URLSearchParams(location.search).get('k'); if (k) { sessionStorage.setItem('kk-k', k.slice(0, 60)); history.replaceState(null, '', location.pathname + location.hash); } } catch (e) {}
async function start() {
  if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
    gate('<p>Tetapan Firebase belum diisi. Buka fail <b>firebase-config.js</b> dan tampal tetapan awak, ikut panduan pemasangan.</p>');
    window.__setUse(async n => (n === 'mcp' ? mcp : null));
    return;
  }
  let fb;
  try {
    const [A, Au, F] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${V}/firebase-auth.js`),
      import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`)
    ]);
    fb = { A, Au, F };
  } catch (e) {
    gate('<p>Tidak dapat memuatkan Firebase. Semak sambungan internet dan cuba lagi.</p><button class="btn" onclick="location.reload()">Cuba lagi</button>');
    window.__setUse(async n => (n === 'mcp' ? mcp : null));
    return;
  }
  const { A, Au, F } = fb;
  const app = A.initializeApp(firebaseConfig);
  const auth = Au.getAuth(app);
  let db;
  try { db = F.initializeFirestore(app, { localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }) }); }
  catch (e) { db = F.getFirestore(app); }

  const split = p => p.split('/');
  const docRef = p => F.doc(db, ...split(p));
  const colRef = p => F.collection(db, ...split(p));
  const wrapDoc = p => ({
    get: async () => { const s = await F.getDoc(docRef(p)); return { id: s.id, exists: s.exists(), data: () => s.data() }; },
    set: d => F.setDoc(docRef(p), d),
    delete: () => F.deleteDoc(docRef(p))
  });
  const dbApi = {
    doc: wrapDoc,
    collection: p => ({
      onSnapshot: (cb, err) => F.onSnapshot(colRef(p), s => cb({
        docs: s.docs.map(d => ({ id: d.id, exists: true, data: () => d.data() })),
        size: s.size, empty: s.empty, metadata: { fromCache: s.metadata.fromCache }
      }), err),
      add: async d => { const r = await F.addDoc(colRef(p), d); return { id: r.id }; },
      doc: id => wrapDoc(p + '/' + id)
    })
  };

  let me = null, admin = false;
  const profCache = new Map();
  const hue = id => { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360; return 'hsl(' + h + ' 55% 42%)'; };
  const userApi = {
    me: async () => ({ id: me.uid, isOwner: admin, canEdit: admin }),
    can: async () => true,
    profiles: async ids => {
      const out = {};
      await Promise.all(ids.map(async id => {
        if (!profCache.has(id)) {
          try { const s = await F.getDoc(docRef('members/' + id)); const d = s.exists() ? s.data() : {}; profCache.set(id, { id, name: d.name || '', avatarUrl: d.photo || '', color: hue(id) }); }
          catch (e) { profCache.set(id, { id, name: '', avatarUrl: '', color: hue(id) }); }
        }
        out[id] = profCache.get(id);
      }));
      return out;
    }
  };

  window.__signOut = () => Au.signOut(auth).then(() => location.reload());

  const loginView = (msg) => {
    let inv = ''; try { inv = sessionStorage.getItem('kk-k') ? '<p><b>Awak dijemput!</b> Log masuk dengan Google untuk menyertai.</p>' : ''; } catch (e) {}
    gate(inv + '<p>Simpan dan lihat semula gambar keluarga dalam satu tempat peribadi.</p><button class="btn" id="g-login">Log masuk dengan Google</button><div class="err" id="g-err">' + esc(msg || '') + '</div>');
    $('g-login').onclick = async () => {
      $('g-err').textContent = '';
      try { await Au.signInWithPopup(auth, new Au.GoogleAuthProvider()); }
      catch (e) {
        if (e && (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment')) { Au.signInWithRedirect(auth, new Au.GoogleAuthProvider()); return; }
        if (e && e.code === 'auth/unauthorized-domain') $('g-err').textContent = 'Domain app ini belum ditambah dalam Firebase (Authentication, Settings, Authorized domains).';
        else if (e && e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') $('g-err').textContent = 'Log masuk gagal. Cuba lagi.';
      }
    };
  };

  const checkMember = async (user) => {
    try {
      const s = await F.getDoc(docRef('members/' + user.uid));
      return s.exists() ? s.data() : null;
    } catch (e) { return null; }
  };
  const codeView = (user, msg) => new Promise(resolve => {
    gate('<p>Hai ' + esc((user.displayName || '').split(' ')[0] || '') + '. Masukkan kod keluarga untuk menyertai.</p><input id="g-code" type="text" autocomplete="off" autocapitalize="off" placeholder="Kod keluarga" aria-label="Kod keluarga"><button class="btn" id="g-join">Sertai</button><div class="err" id="g-err">' + esc(msg || '') + '</div><button class="lnk" id="g-out">Guna akaun lain</button>');
    $('g-out').onclick = () => Au.signOut(auth).then(() => location.reload());
    let pre = ''; try { pre = sessionStorage.getItem('kk-k') || ''; sessionStorage.removeItem('kk-k'); } catch (e) {}
    $('g-join').onclick = async () => {
      const code = $('g-code').value.trim();
      if (!code) return;
      $('g-join').disabled = true;
      try {
        await F.setDoc(docRef('members/' + user.uid), { name: user.displayName || '', photo: user.photoURL || '', joinedAt: Date.now(), code });
        resolve(await checkMember(user));
      } catch (e) {
        $('g-join').disabled = false;
        $('g-err').textContent = 'Kod tidak betul. Tanya kod daripada ahli keluarga yang menjemput awak.';
      }
    };
    if (pre) { $('g-code').value = pre; $('g-join').click(); }
  });

  let ready;
  const readyP = new Promise(r => (ready = r));
  window.__setUse(async n => {
    if (n === 'mcp') return mcp;
    const ok = await readyP;
    if (!ok) return null;
    return n === 'db' ? dbApi : n === 'user' ? userApi : null;
  });

  loginView();
  let first = true;
  Au.onAuthStateChanged(auth, async user => {
    if (!user) { if (!first) location.reload(); first = false; loginView(); return; }
    first = false;
    gate('<p>Memuat…</p>');
    me = user;
    let m = await checkMember(user);
    if (!m) m = await codeView(user);
    if (!m) { loginView('Tidak dapat menyertai.'); return; }
    admin = m.admin === true;
    if ((m.name || '') !== (user.displayName || '') || (m.photo || '') !== (user.photoURL || '')) {
      F.setDoc(docRef('members/' + user.uid), { name: user.displayName || '', photo: user.photoURL || '' }, { merge: true }).catch(() => {});
    }
    hideGate();
    ready(true);
  });
}
start();

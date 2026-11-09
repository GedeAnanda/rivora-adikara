// FR-BE-02 · API 7.2: POST /reports (multipart: foto, jenis_saluran, lat, lng, captured_at). Token opsional.
// FR-BE-03: validasi input. FR-BE-07 · API 7.3: GET /reports/:id.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const db = require('../db');
const { httpError, ambilId } = require('../errors');
const { cariAtauBuatSaluran } = require('../saluran');
const { lokasiDemoDiminta, saluranDemo, petaLokasiDemo, cadanganDemo } = require('../demo');
const { simpanFoto } = require('../storage');

const router = express.Router();

// UPLOAD_DIR bisa diarahkan ke volume persisten saat deploy (mis. /data/uploads).
const UPLOAD_DIR = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.join(__dirname, '..', '..', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
// Foto contoh seed (backend/assets/contoh.jpg, di-commit) disalin ke uploads/ bila belum ada.
const CONTOH_ASET = path.join(__dirname, '..', '..', 'assets', 'contoh.jpg');
const CONTOH_TUJUAN = path.join(UPLOAD_DIR, 'contoh.jpg');
if (!fs.existsSync(CONTOH_TUJUAN) && fs.existsSync(CONTOH_ASET)) fs.copyFileSync(CONTOH_ASET, CONTOH_TUJUAN);

const JENIS = ['terbuka', 'gorong_gorong', 'inlet_jalan'];
const KELAS = ['bersih', 'ringan', 'sedang', 'berat', 'tidak_terlihat'];
const KEYAKINAN = ['rendah', 'sedang', 'tinggi'];
const PENYEBAB = ['plastik', 'sedimen', 'daun_ranting', 'puing'];
const EKSTENSI = { 'image/jpeg': '.jpg', 'image/png': '.png' };

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) =>
      cb(null, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${EKSTENSI[file.mimetype]}`),
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) =>
    EKSTENSI[file.mimetype] ? cb(null, true) : cb(httpError(400, 'Foto harus JPEG atau PNG')),
});

function terimaFoto(req, res, next) {
  upload.single('foto')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') return next(httpError(400, 'Ukuran foto maksimal 10 MB'));
    if (err instanceof multer.MulterError) return next(httpError(400, 'Unggahan foto tidak valid'));
    next(err);
  });
}

// Pakai modul AI milik C (backend/src/ai). Kalau belum ada → stub demo agar alur tetap jalan.
function stubAi() {
  return {
    ok: true,
    sumber: 'demo',
    result: { saluran_terlihat: true, kelas_sumbatan: 'berat', skor_sumbatan: 0.85, keyakinan: 'tinggi', penyebab: ['plastik'], catatan: 'STUB backend (modul AI belum ada)' },
  };
}

async function nilaiFoto(filePath, mimeType, jenisSaluran) {
  let ai;
  try {
    ai = require('../ai');
  } catch (err) {
    if (err.code !== 'MODULE_NOT_FOUND') console.error('Modul AI gagal dimuat:', err.message);
    return stubAi();
  }
  if (typeof ai.analyzeReport !== 'function') return stubAi();
  let hasil;
  try {
    const foto = await fs.promises.readFile(filePath);
    hasil = await ai.analyzeReport({ foto, mimeType, jenisSaluran });
  } catch (err) {
    console.error('AI error:', err.message);
    hasil = { ok: false, alasan: 'error' };
  }
  return cadanganDemo(hasil, jenisSaluran); // FR-BE-19
}

// Hasil AI → kolom laporan. AI gagal → laporan tetap disimpan, status cek_manual.
function dariHasilAi(hasil) {
  const gagal = (alasan) => ({
    ai_json: { alasan: alasan || 'gagal' },
    ai_sumber: 'gagal',
    kelas: 'tidak_terlihat',
    skor_sumbatan: null,
    keyakinan: 'rendah',
    status: 'cek_manual',
  });
  if (!hasil || !hasil.ok || !hasil.result) return gagal(hasil && hasil.alasan);

  const r = hasil.result;
  // Keluaran AI (docs/API.md): kelas_sumbatan + saluran_terlihat
  const kelasAi = r.kelas_sumbatan ?? r.kelas;
  const kelas = r.saluran_terlihat === false || !KELAS.includes(kelasAi) ? 'tidak_terlihat' : kelasAi;
  let skor = null;
  if (kelas !== 'tidak_terlihat') {
    skor = Number(r.skor_sumbatan);
    if (r.skor_sumbatan == null || !Number.isFinite(skor)) return gagal('skor_tidak_valid');
    skor = Math.min(Math.max(skor, 0), 1);
  }
  return {
    ai_json: r,
    ai_sumber: hasil.sumber === 'demo' ? 'demo' : 'model',
    kelas,
    skor_sumbatan: skor,
    keyakinan: KEYAKINAN.includes(r.keyakinan) ? r.keyakinan : 'rendah',
    status: kelas === 'tidak_terlihat' ? 'cek_manual' : 'dikirim',
  };
}

// ---------- Bentuk respons API 7.2 / 7.3 ----------

// digabung (GET) = sudah ada laporan lain di saluran ini sebelum laporan ini.
// POST memakai nilai asli dari cariAtauBuatSaluran.
async function ambilLaporan(id) {
  const { rows } = await db.query(
    `SELECT l.id, l.status, l.jenis_saluran, ST_Y(l.geom::geometry) AS lat, ST_X(l.geom::geometry) AS lng,
       l.captured_at, l.foto_url, l.ai_json, l.ai_sumber, l.kelas, l.skor_sumbatan, l.keyakinan,
       l.saluran_id, s.rw_id, rw.nama AS rw_nama, l.lokasi_demo,
       EXISTS (SELECT 1 FROM laporan l2 WHERE l2.saluran_id = l.saluran_id AND l2.id < l.id) AS digabung
     FROM laporan l
     JOIN saluran s ON s.id = l.saluran_id
     LEFT JOIN rw ON rw.id = s.rw_id
     WHERE l.id = $1`,
    [id]
  );
  const r = rows[0];
  if (!r) return null;
  const j = r.ai_json || {};
  return {
    id: r.id,
    status: r.status,
    jenis_saluran: r.jenis_saluran,
    lat: r.lat,
    lng: r.lng,
    captured_at: r.captured_at,
    foto_url: r.foto_url,
    // Selalu objek (tidak null) agar mobile tidak error; AI gagal → tidak_terlihat + catatan.
    ai: {
      jenis_saluran: JENIS.includes(j.jenis_saluran) ? j.jenis_saluran : r.jenis_saluran,
      saluran_terlihat: r.kelas !== 'tidak_terlihat',
      kelas_sumbatan: r.kelas,
      skor_sumbatan: r.skor_sumbatan,
      penyebab: Array.isArray(j.penyebab) ? j.penyebab.filter((p) => PENYEBAB.includes(p)) : [],
      keyakinan: r.keyakinan,
      catatan: r.ai_sumber === 'gagal'
        ? 'Penilaian AI gagal, saluran perlu dicek manual'
        : typeof j.catatan === 'string' ? j.catatan : '',
    },
    ai_sumber: r.ai_sumber,
    saluran_id: r.saluran_id,
    digabung: r.digabung,
    rw_id: r.rw_id,
    rw_nama: r.rw_nama,
    lokasi_demo: r.lokasi_demo,
  };
}

// ---------- FR-BE-03: validasi ----------
const MAKS_UMUR_FOTO_MS = 60 * 60 * 1000; // 60 menit lalu
const MAKS_MAJU_FOTO_MS = 5 * 60 * 1000; // 5 menit ke depan (beda jam HP)
const BENAR = ['true', '1', 'yes'];

const angka = (v) => (v == null || String(v).trim() === '' ? NaN : Number(v));

function cekInput(body) {
  if (!JENIS.includes(body.jenis_saluran)) return 'jenis_saluran harus terbuka, gorong_gorong, atau inlet_jalan';
  return cekLokasiWaktu(body);
}

// Dipakai juga oleh POST /tasks/:id/verify
function cekLokasiWaktu(body) {
  const lat = angka(body.lat);
  const lng = angka(body.lng);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    return 'lat dan lng wajib diisi dengan koordinat yang valid';
  }
  // [ASUMSI] mobile mengirim flag lokasi palsu sebagai field "lokasi_palsu" (atau "is_mocked")
  if (BENAR.includes(String(body.lokasi_palsu ?? body.is_mocked ?? '').toLowerCase())) {
    return 'Lokasi palsu terdeteksi. Matikan aplikasi lokasi palsu lalu foto ulang';
  }
  if (!body.captured_at) return 'captured_at wajib diisi (waktu ISO 8601)';
  const t = new Date(body.captured_at);
  if (Number.isNaN(t.getTime())) return 'captured_at harus waktu ISO 8601';
  const selisih = Date.now() - t.getTime();
  if (selisih > MAKS_UMUR_FOTO_MS) return 'Foto sudah lebih dari 60 menit. Ambil foto baru';
  if (selisih < -MAKS_MAJU_FOTO_MS) return 'Waktu foto di masa depan. Periksa jam HP';
  return null;
}

// ---------- Route ----------

router.post('/', terimaFoto, async (req, res) => {
  if (!req.file) throw httpError(400, 'Foto wajib dikirim (field "foto")');
  const salah = cekInput(req.body);
  if (salah) {
    await fs.promises.unlink(req.file.path).catch(() => {});
    throw httpError(400, salah);
  }

  const jenis = req.body.jenis_saluran;
  const lat = Number(req.body.lat);
  const lng = Number(req.body.lng);
  const capturedAt = new Date(req.body.captured_at);

  // FR-BE-21 [DEMO]: posisi asli HP tetap disimpan di laporan.geom.
  // DEMO_ASAL diisi → titik digeser ke wilayah demo, lalu digabung/dibuat saluran seperti biasa
  // (selokan berbeda = saluran berbeda). Tidak diisi → satu saluran DEMO_SALURAN_ID (perilaku lama).
  const lokasiDemo = lokasiDemoDiminta(req.body);
  const ai = dariHasilAi(await nilaiFoto(req.file.path, req.file.mimetype, jenis));
  let saluran;
  if (!lokasiDemo) {
    saluran = await cariAtauBuatSaluran({ lat, lng, jenis });
  } else {
    const peta = await petaLokasiDemo({ lat, lng });
    saluran = peta
      ? await cariAtauBuatSaluran({ ...peta, jenis, rwTerdekat: true })
      : { id: (await saluranDemo()).id, baru: false };
  }
  const fotoUrl = await simpanFoto(req, req.file);
  const pelaporId = req.user ? req.user.id : null; // token opsional (FR-BE-01)

  const { rows } = await db.query(
    `INSERT INTO laporan (saluran_id, pelapor_id, jenis_saluran, foto_url, geom, captured_at,
       ai_json, ai_sumber, kelas, skor_sumbatan, keyakinan, status, lokasi_demo)
     VALUES ($1, $2, $3, $4, ST_SetSRID(ST_MakePoint($5, $6), 4326)::geography, $7, $8, $9, $10, $11, $12, $13, $14)
     RETURNING id`,
    [saluran.id, pelaporId, jenis, fotoUrl, lng, lat, capturedAt.toISOString(),
      ai.ai_json, ai.ai_sumber, ai.kelas, ai.skor_sumbatan, ai.keyakinan, ai.status, lokasiDemo]
  );

  const laporan = await ambilLaporan(rows[0].id);
  laporan.digabung = !saluran.baru;
  res.status(201).json(laporan);
});

// FR-BE-07 · API 7.3
router.get('/:id', async (req, res) => {
  const id = ambilId(req);
  const laporan = await ambilLaporan(id);
  if (!laporan) throw httpError(404, 'Laporan tidak ditemukan');

  // Tugas yang menangani laporan ini, di saluran yang sama:
  // - tugas yang dibuat lurah SESUDAH laporan ini masuk (laporan ikut ditugaskan), atau
  // - tugas yang dibuat sebelumnya tapi SELESAI sesudah laporan ini masuk (salurannya sudah dibersihkan).
  // Tugas aktif yang dibuat sebelum laporan ini TIDAK dihitung: laporan baru tidak boleh tampak
  // "ditugaskan" padahal lurah belum menugaskan apa pun untuknya.
  const { rows } = await db.query(
    `SELECT t.id, t.status, p.nama AS petugas_nama, t.foto_sesudah_url, t.selesai_at,
       t.ai_verifikasi_json, lv.kelas AS kelas_verifikasi
     FROM laporan l
     JOIN tugas t ON t.saluran_id = l.saluran_id
       AND (t.laporan_id = l.id OR t.dibuat_at >= l.created_at
            OR (t.status = 'selesai' AND t.selesai_at >= l.created_at))
     JOIN pengguna p ON p.id = t.petugas_id
     LEFT JOIN laporan lv ON lv.id = t.laporan_verifikasi_id
     WHERE l.id = $1 AND l.sumber = 'laporan'
     ORDER BY t.id ASC LIMIT 1`,
    [id]
  );
  const t = rows[0];
  res.json({
    ...laporan,
    tugas: t ? { id: t.id, status: t.status, petugas_nama: t.petugas_nama } : null,
    bukti: t && t.status === 'selesai' ? {
      foto_sesudah_url: t.foto_sesudah_url,
      kelas_sesudah: t.kelas_verifikasi ?? t.ai_verifikasi_json?.kelas_sesudah ?? null,
      selesai_at: t.selesai_at,
    } : null,
  });
});

module.exports = router;
// Helper untuk POST /tasks/:id/verify (routes/tasks.js)
module.exports.terimaFoto = terimaFoto;
module.exports.cekLokasiWaktu = cekLokasiWaktu;
module.exports.UPLOAD_DIR = UPLOAD_DIR;

// Fitur [DEMO] (FR-BE-19/20/21). Semua hanya aktif bila DEMO_MODE=1 dan wajib dilabeli di UI.
// FR-BE-19 [ASUMSI]: AI laporan gagal → pakai hasil contoh (ai_sumber 'demo') agar demo tidak macet.
//   Verifikasi TIDAK pernah memakai hasil contoh: AI gagal = belum lolos (cek manual), bukan "bersih".
// FR-BE-21 [ASUMSI]: klien kirim lokasi_demo=true → laporan/verifikasi dipetakan ke wilayah demo
//   (posisi asli HP tetap disimpan di laporan.geom, kolom lokasi_demo = true).
//   - DEMO_ASAL_LAT/DEMO_ASAL_LNG diisi (titik di sekitar tempat uji): posisi HP digeser sejajar ke
//     sekitar pusat kelurahan saluran DEMO_SALURAN_ID. Jarak antar-titik tetap sama, jadi selokan
//     berbeda = saluran berbeda, dan cek radius verifikasi 30 m tetap berlaku.
//   - Tidak diisi: semua laporan masuk ke satu saluran DEMO_SALURAN_ID (perilaku lama); verifikasi
//     membandingkan posisi asli HP dengan posisi asli foto sebelum.
const db = require('./db');
const { httpError } = require('./errors');

const demoAktif = () => process.env.DEMO_MODE === '1';

const BENAR = ['true', '1', 'yes'];
const lokasiDemoDiminta = (body) =>
  demoAktif() && BENAR.includes(String((body && body.lokasi_demo) ?? '').toLowerCase());

async function saluranDemo() {
  const id = Number(process.env.DEMO_SALURAN_ID);
  if (!Number.isInteger(id) || id <= 0) throw httpError(500, 'DEMO_SALURAN_ID belum diisi di server');
  const { rows } = await db.query(
    'SELECT id, ST_Y(geom::geometry) AS lat, ST_X(geom::geometry) AS lng FROM saluran WHERE id = $1',
    [id]
  );
  if (!rows[0]) throw httpError(500, 'DEMO_SALURAN_ID tidak ada di database');
  return rows[0];
}

/** Titik asal tempat uji dari env, atau null bila tidak diisi / tidak valid. */
function asalDemo() {
  const lat = Number(process.env.DEMO_ASAL_LAT);
  const lng = Number(process.env.DEMO_ASAL_LNG);
  const isi = (v) => v != null && String(v).trim() !== '';
  if (!isi(process.env.DEMO_ASAL_LAT) || !isi(process.env.DEMO_ASAL_LNG)) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

/**
 * Geser titik asli sejajar: tujuan + (titik - asal). Fungsi murni (diuji di demo.test.js).
 * Pergeseran derajat yang sama menjaga jarak antar-titik di area sempit (±1 km) praktis tidak berubah.
 */
function geserSejajar(titik, asal, tujuan) {
  return { lat: tujuan.lat + (titik.lat - asal.lat), lng: tujuan.lng + (titik.lng - asal.lng) };
}

/** Pusat kelurahan tempat saluran DEMO_SALURAN_ID berada (titik tujuan pemetaan). */
async function pusatWilayahDemo() {
  const s = await saluranDemo();
  const { rows } = await db.query(
    `SELECT ST_Y(k.centroid::geometry) AS lat, ST_X(k.centroid::geometry) AS lng
     FROM saluran s JOIN rw ON rw.id = s.rw_id JOIN kelurahan k ON k.id = rw.kelurahan_id
     WHERE s.id = $1`,
    [s.id]
  );
  return rows[0] ?? { lat: s.lat, lng: s.lng };
}

/**
 * Posisi demo untuk titik asli HP, atau null bila DEMO_ASAL tidak diisi (pakai perilaku lama).
 * DEMO_ASAL dipetakan ke pusat kelurahan demo, jadi selokan dalam radius ±400 m dari DEMO_ASAL
 * tetap jatuh di dalam wilayah RW.
 */
async function petaLokasiDemo(titik) {
  const asal = asalDemo();
  if (!asal) return null;
  return geserSejajar(titik, asal, await pusatWilayahDemo());
}

// FR-BE-19: dipanggil sesudah AI. Hasil gagal + DEMO_MODE → contoh dari modul C (hanya laporan).
function cadanganDemo(hasil, jenis) {
  if ((hasil && hasil.ok) || !demoAktif()) return hasil;
  // Verifikasi tidak boleh lolos tanpa penilaian AI asli.
  if (jenis === 'verifikasi') return hasil;
  const contoh = require('./ai/contoh');
  const result = contoh.contohLaporan(jenis);
  console.warn(`[demo] AI gagal (${hasil && hasil.alasan}), pakai hasil contoh`);
  return { ok: true, sumber: 'demo', result };
}

module.exports = { demoAktif, lokasiDemoDiminta, saluranDemo, asalDemo, geserSejajar, petaLokasiDemo, cadanganDemo };

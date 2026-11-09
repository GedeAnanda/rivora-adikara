// Ambil data DB + hitung skor. Dipakai GET /rw/risk (7.4), GET /saluran (7.5), GET /priorities (7.7).
const db = require('../db');
const { httpError } = require('../errors');
const { BOBOT, HUJAN_LEBAT_MM, bulat2, skorH, skorS, skorRw, skorPrioritas } = require('./score');
const { getHujan24j } = require('../weather/openMeteo');

async function ambilKelurahan(id) {
  const { rows } = await db.query('SELECT id, nama FROM kelurahan WHERE id = $1', [id]);
  if (!rows[0]) throw httpError(404, 'Kelurahan tidak ditemukan');
  return rows[0];
}

function metaHujan(hujan) {
  return {
    hujan_24j_mm: hujan.mm_24j,
    hujan_sumber: hujan.sumber,
    hujan_diambil_at: hujan.fetched_at,
    hujan_lebat_diprediksi: hujan.mm_24j >= HUJAN_LEBAT_MM,
  };
}

// Semua saluran di kelurahan + kondisi terkini (laporan terlihat & AI tidak gagal, bag. 9.1),
// laporan terakhir apa pun (untuk cek manual), dan tugas aktif.
async function daftarSaluran(kelurahanId) {
  const { rows } = await db.query(
    `SELECT s.id AS saluran_id, s.jenis, s.rw_id, rw.nama AS rw_nama, rw.kerentanan,
       ST_Y(s.geom::geometry) AS lat, ST_X(s.geom::geometry) AS lng,
       k.id AS k_id, k.kelas AS k_kelas, k.skor_sumbatan AS k_skor, k.keyakinan AS k_keyakinan,
       k.foto_url AS k_foto_url, k.captured_at AS k_captured_at,
       t.id AS t_id, t.kelas AS t_kelas, t.ai_sumber AS t_ai_sumber, t.foto_url AS t_foto_url,
       t.captured_at AS t_captured_at, t.ai_json->>'catatan' AS t_catatan,
       tg.id AS tg_id, tg.status AS tg_status, p.nama AS tg_petugas_nama
     FROM saluran s
     JOIN rw ON rw.id = s.rw_id
     LEFT JOIN LATERAL (
       SELECT * FROM laporan
       WHERE saluran_id = s.id AND kelas <> 'tidak_terlihat' AND ai_sumber <> 'gagal'
       ORDER BY captured_at DESC, id DESC LIMIT 1
     ) k ON true
     LEFT JOIN LATERAL (
       SELECT * FROM laporan WHERE saluran_id = s.id ORDER BY captured_at DESC, id DESC LIMIT 1
     ) t ON true
     LEFT JOIN tugas tg ON tg.saluran_id = s.id AND tg.status <> 'selesai'
     LEFT JOIN pengguna p ON p.id = tg.petugas_id
     WHERE rw.kelurahan_id = $1
     ORDER BY s.id`,
    [kelurahanId]
  );
  return rows.map((r) => ({
    saluran_id: r.saluran_id,
    jenis: r.jenis,
    rw_id: r.rw_id,
    rw_nama: r.rw_nama,
    lat: r.lat,
    lng: r.lng,
    k_rw: Number(r.kerentanan),
    kondisi: r.k_id == null ? null : {
      laporan_id: r.k_id,
      kelas: r.k_kelas,
      skor_sumbatan: r.k_skor,
      keyakinan: r.k_keyakinan,
      foto_url: r.k_foto_url,
      captured_at: r.k_captured_at,
    },
    // laporan terakhir tidak bisa dinilai AI → perlu dicek petugas
    perlu_cek_manual: r.t_id != null && (r.t_kelas === 'tidak_terlihat' || r.t_ai_sumber === 'gagal'),
    terakhir: r.t_id == null ? null : {
      laporan_id: r.t_id, foto_url: r.t_foto_url, captured_at: r.t_captured_at, catatan: r.t_catatan,
    },
    tugas_aktif: r.tg_id == null ? null : { id: r.tg_id, status: r.tg_status, petugas_nama: r.tg_petugas_nama },
  }));
}

const LABEL_LEVEL = { aman: 'Aman', waspada: 'Waspada', risiko_tinggi: 'Risiko tinggi' };
const angkaId = (x) => String(x).replace('.', ',');

function susunAlasan({ level, hujan, s, jumlahTersumbat, rw }) {
  const bagian = [];
  if (hujan.sumber === 'tidak_tersedia') bagian.push('data prakiraan hujan tidak tersedia');
  else if (hujan.mm_24j > 0) bagian.push(`prakiraan hujan ${angkaId(hujan.mm_24j)} mm dalam 24 jam`);
  else bagian.push('tidak ada prakiraan hujan dalam 24 jam');

  if (!s.data_cukup) bagian.push('belum ada laporan kondisi saluran');
  else bagian.push(`${jumlahTersumbat} dari ${s.jumlah_saluran} saluran tersumbat sedang–berat`);

  let lokasi = Number(rw.elevasi_relatif) >= 0.5 ? 'lokasi rendah' : 'lokasi relatif tinggi';
  if (rw.jarak_genangan_m != null && rw.genangan_terdekat) {
    lokasi += ` dan ${Math.round(rw.jarak_genangan_m)} m dari titik genangan ${rw.genangan_terdekat}`;
  }
  bagian.push(lokasi);
  return `${LABEL_LEVEL[level]}: ${bagian.join(', ')}.`;
}

async function hitungRisikoRw(kelurahanId) {
  const kelurahan = await ambilKelurahan(kelurahanId);
  const [hujan, rwRes, saluran] = await Promise.all([
    getHujan24j(kelurahanId),
    db.query(
      `SELECT rw.id, rw.nama, rw.kerentanan, rw.elevasi_relatif, rw.jarak_genangan_m,
         ST_AsGeoJSON(rw.geom)::json AS geometry, g.nama AS genangan_terdekat
       FROM rw
       LEFT JOIN LATERAL (
         SELECT nama FROM titik_genangan ORDER BY ST_Distance(titik_genangan.geom, rw.geom) LIMIT 1
       ) g ON true
       WHERE rw.kelurahan_id = $1 ORDER BY rw.id`,
      [kelurahanId]
    ),
    daftarSaluran(kelurahanId),
  ]);
  const h = skorH(hujan.mm_24j);

  const perRw = new Map();
  for (const x of saluran) {
    if (!perRw.has(x.rw_id)) perRw.set(x.rw_id, []);
    perRw.get(x.rw_id).push(x);
  }

  const rw = rwRes.rows.map((r) => {
    const list = perRw.get(r.id) || [];
    const kondisi = list.filter((x) => x.kondisi).map((x) => x.kondisi);
    const s = skorS(kondisi);
    const k = Number(r.kerentanan);
    const { skor, level } = skorRw({ h, s: s.s, k });
    const jumlahTersumbat = kondisi.filter((x) => x.kelas === 'sedang' || x.kelas === 'berat').length;
    return {
      geometry: r.geometry,
      rw_id: r.id,
      nama: r.nama,
      skor,
      level,
      komponen: {
        hujan: { nilai: bulat2(h), bobot: BOBOT.hujan, kontribusi: bulat2(BOBOT.hujan * h), mm: hujan.mm_24j },
        sumbatan: {
          nilai: bulat2(s.s), bobot: BOBOT.sumbatan, kontribusi: bulat2(BOBOT.sumbatan * s.s),
          jumlah_saluran: s.jumlah_saluran,
          jumlah_cek_manual: list.filter((x) => x.perlu_cek_manual).length,
          data_cukup: s.data_cukup,
        },
        kerentanan: {
          nilai: bulat2(k), bobot: BOBOT.kerentanan, kontribusi: bulat2(BOBOT.kerentanan * k),
          elevasi_relatif: r.elevasi_relatif,
          jarak_genangan_m: r.jarak_genangan_m,
          genangan_terdekat: r.genangan_terdekat,
        },
      },
      alasan: susunAlasan({ level, hujan, s, jumlahTersumbat, rw: r }),
    };
  });
  return { kelurahan, hujan, rw };
}

// Skor prioritas saluran = 0,4·H + 0,4·skor_sumbatan + 0,2·K_rw, urut menurun.
async function hitungPrioritas(kelurahanId) {
  await ambilKelurahan(kelurahanId);
  const [hujan, saluran] = await Promise.all([getHujan24j(kelurahanId), daftarSaluran(kelurahanId)]);
  const h = skorH(hujan.mm_24j);

  // Sama dengan kontrak dasbor (mocks/server.js): saluran yang kondisi terkininya bersih tidak perlu
  // dibersihkan, dan saluran yang perlu dicek langsung hanya muncul di daftar cek manual.
  const prioritas = saluran
    .filter((x) => x.kondisi && x.kondisi.kelas !== 'bersih' && !x.perlu_cek_manual)
    .map((x) => ({
      saluran_id: x.saluran_id, jenis: x.jenis, rw_id: x.rw_id, rw_nama: x.rw_nama,
      lat: x.lat, lng: x.lng,
      kelas: x.kondisi.kelas, skor_sumbatan: x.kondisi.skor_sumbatan, keyakinan: x.kondisi.keyakinan,
      foto_url: x.kondisi.foto_url, captured_at: x.kondisi.captured_at,
      skor_prioritas: skorPrioritas({ h, skorSumbatan: x.kondisi.skor_sumbatan, kRw: x.k_rw }),
      komponen: { hujan: bulat2(h), sumbatan: x.kondisi.skor_sumbatan, kerentanan: bulat2(x.k_rw) },
      tugas_aktif: x.tugas_aktif,
    }))
    .sort((a, b) => b.skor_prioritas - a.skor_prioritas || new Date(b.captured_at) - new Date(a.captured_at))
    .map((p, i) => ({ peringkat: i + 1, ...p }));

  const cekManual = saluran
    .filter((x) => x.perlu_cek_manual)
    .map((x) => ({
      saluran_id: x.saluran_id, jenis: x.jenis, rw_nama: x.rw_nama,
      foto_url: x.terakhir.foto_url, captured_at: x.terakhir.captured_at,
      catatan: x.terakhir.catatan || 'Kondisi saluran tidak dapat dinilai AI',
      // Dasbor menyembunyikan tombol Tugaskan bila saluran sudah punya tugas aktif (hindari 409).
      tugas_aktif: x.tugas_aktif,
    }));

  return { hujan, prioritas, cekManual };
}

module.exports = { ambilKelurahan, metaHujan, daftarSaluran, hitungRisikoRw, hitungPrioritas };

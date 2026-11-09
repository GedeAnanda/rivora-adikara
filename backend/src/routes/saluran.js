// FR-BE-10 · API 7.5: GET /saluran?kelurahan_id=1 → GeoJSON titik saluran + kondisi terkini.
// FR-BE-11 · API 7.6: GET /saluran/:id → detail + riwayat laporan + tugas.
const express = require('express');
const db = require('../db');
const { httpError, ambilKelurahanId, ambilId } = require('../errors');
const { ambilKelurahan, daftarSaluran } = require('../risk/data');
const { cariTugas } = require('../tugas');

const router = express.Router();

router.get('/', async (req, res) => {
  const kelurahanId = ambilKelurahanId(req);
  await ambilKelurahan(kelurahanId);
  // Saluran tanpa laporan sama sekali (mis. jangkar DEMO_SALURAN_ID setelah data dikosongkan)
  // tidak punya kondisi apa pun, jadi tidak digambar di peta.
  const saluran = (await daftarSaluran(kelurahanId)).filter((x) => x.terakhir);
  res.json({
    type: 'FeatureCollection',
    features: saluran.map((x) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [x.lng, x.lat] },
      properties: {
        saluran_id: x.saluran_id,
        jenis: x.jenis,
        rw_id: x.rw_id,
        rw_nama: x.rw_nama,
        kondisi: x.kondisi,
        perlu_cek_manual: x.perlu_cek_manual,
        tugas_aktif: x.tugas_aktif,
      },
    })),
  });
});

router.get('/:id', async (req, res) => {
  const id = ambilId(req);
  const { rows } = await db.query(
    `SELECT s.id, s.jenis, s.rw_id, rw.nama AS rw_nama,
       ST_Y(s.geom::geometry) AS lat, ST_X(s.geom::geometry) AS lng
     FROM saluran s LEFT JOIN rw ON rw.id = s.rw_id WHERE s.id = $1`,
    [id]
  );
  const s = rows[0];
  if (!s) throw httpError(404, 'Saluran tidak ditemukan');

  const [riwayat, tugas] = await Promise.all([
    db.query(
      `SELECT id AS laporan_id, sumber, kelas, skor_sumbatan, keyakinan, foto_url, captured_at,
         status, ai_sumber, lokasi_demo, ai_json->>'catatan' AS catatan,
         COALESCE(ai_json->'penyebab', '[]'::jsonb) AS penyebab,
         -- Laporan verifikasi: lolos bila AI menilai bersih/ringan di saluran yang sama.
         CASE WHEN sumber = 'verifikasi' THEN
           ai_sumber <> 'gagal' AND kelas IN ('bersih', 'ringan')
           AND COALESCE(ai_json->>'sudah_bersih', 'false') = 'true'
           AND COALESCE(ai_json->>'tempat_sama', 'true') <> 'false'
         END AS lolos_verifikasi
       FROM laporan WHERE saluran_id = $1 ORDER BY captured_at DESC, id DESC`,
      [id]
    ),
    cariTugas('WHERE t.saluran_id = $1', [id]),
  ]);

  res.json({
    saluran_id: s.id, jenis: s.jenis, rw_id: s.rw_id, rw_nama: s.rw_nama, lat: s.lat, lng: s.lng,
    riwayat: riwayat.rows,
    tugas,
  });
});

module.exports = router;

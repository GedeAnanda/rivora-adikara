// FR-BE-04: gabung laporan ke saluran terdekat (radius 15 m), atau buat saluran baru + tentukan RW.
const db = require('./db');

const RADIUS_GABUNG_M = 15;
const TITIK = 'ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography';

// [ASUMSI] hanya digabung bila jenis saluran sama (gorong-gorong & inlet berdempetan tetap terpisah).
// rwTerdekat [DEMO]: titik hasil pemetaan lokasi demo yang jatuh di luar semua RW ditempelkan ke RW
// terdekat, supaya tetap tampil di dasbor. Laporan biasa di luar wilayah tetap rw_id NULL.
async function cariAtauBuatSaluran({ lat, lng, jenis, rwTerdekat = false }, client = db) {
  const ada = await client.query(
    `SELECT id, rw_id FROM saluran
     WHERE jenis = $3 AND ST_DWithin(geom, ${TITIK}, ${RADIUS_GABUNG_M})
     ORDER BY ST_Distance(geom, ${TITIK}) LIMIT 1`,
    [lng, lat, jenis]
  );
  if (ada.rows[0]) return { ...ada.rows[0], baru: false };

  const rw = await client.query(
    rwTerdekat
      ? `SELECT id FROM rw ORDER BY ST_Distance(geom, ${TITIK}) LIMIT 1`
      : `SELECT id FROM rw WHERE ST_Covers(geom, ${TITIK}) LIMIT 1`,
    [lng, lat]
  );
  const baru = await client.query(
    `INSERT INTO saluran (rw_id, jenis, geom) VALUES ($3, $4, ${TITIK}) RETURNING id, rw_id`,
    [lng, lat, rw.rows[0]?.id ?? null, jenis] // rw_id NULL = di luar wilayah
  );
  return { ...baru.rows[0], baru: true };
}

module.exports = { RADIUS_GABUNG_M, cariAtauBuatSaluran };

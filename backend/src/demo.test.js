// node --test src/demo.test.js
const test = require('node:test')
const assert = require('node:assert')
const demo = require('./demo')

const jarakM = (a, b) => {
  // Haversine sederhana untuk tes (meter)
  const R = 6371000
  const rad = (d) => (d * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

test('geserSejajar: titik asal jatuh tepat di tujuan', () => {
  const asal = { lat: -6.975, lng: 107.631 }
  const tujuan = { lat: -6.9386, lng: 107.6888 }
  assert.deepStrictEqual(demo.geserSejajar(asal, asal, tujuan), tujuan)
})

test('geserSejajar: jarak antar-selokan tetap (beda tempat tetap beda)', () => {
  const asal = { lat: -6.975, lng: 107.631 } // sekitar Bojongsoang
  const tujuan = { lat: -6.9386, lng: 107.6888 } // sekitar Cisaranten Kidul
  const selokanA = { lat: -6.9751, lng: 107.6312 }
  const selokanB = { lat: -6.9758, lng: 107.6321 } // ±150 m dari A
  const a = demo.geserSejajar(selokanA, asal, tujuan)
  const b = demo.geserSejajar(selokanB, asal, tujuan)
  assert.ok(Math.abs(jarakM(selokanA, selokanB) - jarakM(a, b)) < 0.5)
  assert.ok(jarakM(a, b) > 30) // selokan lain tidak lolos radius verifikasi 30 m
})

test('asalDemo: kosong atau tidak valid -> null (perilaku lama)', () => {
  delete process.env.DEMO_ASAL_LAT
  delete process.env.DEMO_ASAL_LNG
  assert.strictEqual(demo.asalDemo(), null)
  process.env.DEMO_ASAL_LAT = 'abc'
  process.env.DEMO_ASAL_LNG = '107.6'
  assert.strictEqual(demo.asalDemo(), null)
  process.env.DEMO_ASAL_LAT = '-6.975'
  process.env.DEMO_ASAL_LNG = '107.631'
  assert.deepStrictEqual(demo.asalDemo(), { lat: -6.975, lng: 107.631 })
  delete process.env.DEMO_ASAL_LAT
  delete process.env.DEMO_ASAL_LNG
})

test('cadanganDemo: verifikasi gagal tidak pernah diganti hasil contoh', () => {
  process.env.DEMO_MODE = '1'
  const gagal = { ok: false, alasan: 'timeout' }
  assert.deepStrictEqual(demo.cadanganDemo(gagal, 'verifikasi'), gagal)
  const laporan = demo.cadanganDemo(gagal, 'terbuka')
  assert.strictEqual(laporan.ok, true)
  assert.strictEqual(laporan.sumber, 'demo')
  delete process.env.DEMO_MODE
})

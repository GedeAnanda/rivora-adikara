// node --test src/ai   (tanpa memanggil API asli: klien diganti tiruan)
const test = require('node:test')
const assert = require('node:assert')
const ai = require('./index')

const foto = Buffer.from('bukan-gambar-asli')
const laporanOk = {
  jenis_saluran: 'terbuka', saluran_terlihat: true, kelas_sumbatan: 'berat', skor_sumbatan: 0.85,
  penyebab: ['plastik', 'sedimen'], keyakinan: 'tinggi', catatan: 'Sampah plastik menutupi saluran',
}

function tiruan(jawaban) {
  let n = 0
  return {
    panggilan: () => n,
    messages: {
      create: async () => {
        const j = jawaban[Math.min(n++, jawaban.length - 1)]
        if (j instanceof Error) throw j
        return { stop_reason: 'end_turn', content: [{ type: 'text', text: typeof j === 'string' ? j : JSON.stringify(j) }] }
      },
    },
  }
}

test('hasil model yang valid -> sumber model', async () => {
  ai._klien = tiruan([laporanOk])
  const r = await ai.analyzeReport({ foto, mimeType: 'image/jpeg', jenisSaluran: 'terbuka' })
  assert.deepStrictEqual(r, { ok: true, sumber: 'model', result: laporanOk })
})

test('JSON rusak lalu valid -> diulang sekali, berhasil', async () => {
  const k = tiruan(['{rusak', laporanOk])
  ai._klien = k
  const r = await ai.analyzeReport({ foto, mimeType: 'image/jpeg', jenisSaluran: 'terbuka' })
  assert.strictEqual(r.sumber, 'model')
  assert.strictEqual(k.panggilan(), 2)
})

test('skor tidak cocok kelas dua kali -> gagal tanpa DEMO_MODE', async () => {
  delete process.env.DEMO_MODE
  ai._klien = tiruan([{ ...laporanOk, kelas_sumbatan: 'bersih' }])
  const r = await ai.analyzeReport({ foto, mimeType: 'image/jpeg', jenisSaluran: 'terbuka' })
  assert.strictEqual(r.ok, false)
  assert.match(r.alasan, /tidak cocok/)
})

test('gagal dua kali + DEMO_MODE=1 -> hasil contoh sumber demo', async () => {
  process.env.DEMO_MODE = '1'
  ai._klien = tiruan([new Error('timeout')])
  const r = await ai.analyzeReport({ foto, mimeType: 'image/jpeg', jenisSaluran: 'inlet_jalan' })
  assert.strictEqual(r.sumber, 'demo')
  assert.strictEqual(r.result.jenis_saluran, 'inlet_jalan')
  delete process.env.DEMO_MODE
})

const verifikasiOk = {
  tempat_sama: true, bukti_tempat: 'Dinding bata dan pipa di kiri sama', sudah_bersih: true,
  kelas_sesudah: 'bersih', skor_sumbatan_sesudah: 0.08, keyakinan: 'tinggi', catatan: 'Bersih',
}

test('verifikasi valid -> sumber model', async () => {
  ai._klien = tiruan([verifikasiOk])
  const r = await ai.verifyCleaning({ fotoSebelum: foto, fotoSesudah: foto, mimeType: 'image/jpeg' })
  assert.deepStrictEqual(r, { ok: true, sumber: 'model', result: verifikasiOk })
})

test('verifikasi: selokan lain yang bersih (tempat_sama false) -> tidak bersih', async () => {
  ai._klien = tiruan([{ ...verifikasiOk, tempat_sama: false, bukti_tempat: 'Dinding beton, sebelumnya bata' }])
  const r = await ai.verifyCleaning({ fotoSebelum: foto, fotoSesudah: foto, mimeType: 'image/jpeg' })
  assert.strictEqual(r.ok, true)
  assert.strictEqual(r.result.tempat_sama, false)
  assert.strictEqual(r.result.sudah_bersih, false)
})

test('verifikasi: tanpa field tempat_sama -> ditolak validasi (diulang lalu gagal)', async () => {
  delete process.env.DEMO_MODE
  const { tempat_sama, ...tanpa } = verifikasiOk
  ai._klien = tiruan([tanpa])
  const r = await ai.verifyCleaning({ fotoSebelum: foto, fotoSesudah: foto, mimeType: 'image/jpeg' })
  assert.strictEqual(r.ok, false)
  assert.match(r.alasan, /tempat_sama/)
})

test('verifikasi gagal + DEMO_MODE=1 -> tetap gagal, TIDAK memakai contoh bersih', async () => {
  process.env.DEMO_MODE = '1'
  ai._klien = tiruan([new Error('timeout')])
  const r = await ai.verifyCleaning({ fotoSebelum: foto, fotoSesudah: foto, mimeType: 'image/jpeg' })
  assert.strictEqual(r.ok, false)
  delete process.env.DEMO_MODE
})

test('tanpa AI_API_KEY dan tanpa DEMO_MODE -> ok false', async () => {
  ai._klien = null
  delete process.env.AI_API_KEY
  const r = await ai.analyzeReport({ foto, mimeType: 'image/jpeg', jenisSaluran: 'terbuka' })
  assert.deepStrictEqual(r, { ok: false, alasan: 'AI_API_KEY belum diisi' })
})

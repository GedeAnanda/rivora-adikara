// Modul AI vision RIVORA. Pemilik: C (AI dan dasbor). Antarmuka: SRS backend bagian 10.
//
// analyzeReport / verifyCleaning memanggil Claude (Anthropic API) dengan keluaran JSON terstruktur,
// lalu memvalidasinya (validasi.js). Batas 20 detik per panggilan, ulang 1 kali bila gagal.
// Laporan gagal dua kali: DEMO_MODE=1 -> hasil contoh bergiliran (sumber 'demo', FR-BE-19),
// selain itu { ok: false, alasan } supaya backend menandai laporan cek_manual (FR-BE-06).
// Verifikasi gagal selalu { ok: false }: tidak pernah memakai hasil contoh "bersih".
//
// Env: AI_API_KEY (kunci Anthropic), AI_MODEL (bawaan claude-opus-5-5), DEMO_MODE.

const sdk = require('@anthropic-ai/sdk')
const { validasiLaporan, validasiVerifikasi, JENIS, KELAS, PENYEBAB, KEYAKINAN } = require('./validasi')
const { contohLaporan } = require('./contoh')

const Anthropic = sdk.default ?? sdk
const BATAS_MS = 20_000
// Verifikasi membandingkan dua foto dengan penalaran lebih banyak; 2 × 25 detik masih di bawah
// batas tunggu aplikasi mobile (60 detik).
const BATAS_VERIFIKASI_MS = 25_000
const PERCOBAAN = 2

const SKEMA_LAPORAN = {
  type: 'object',
  properties: {
    jenis_saluran: { type: 'string', enum: JENIS },
    saluran_terlihat: { type: 'boolean' },
    kelas_sumbatan: { type: 'string', enum: KELAS },
    skor_sumbatan: { anyOf: [{ type: 'number' }, { type: 'null' }] },
    penyebab: { type: 'array', items: { type: 'string', enum: PENYEBAB } },
    keyakinan: { type: 'string', enum: KEYAKINAN },
    catatan: { type: 'string' },
  },
  required: ['jenis_saluran', 'saluran_terlihat', 'kelas_sumbatan', 'skor_sumbatan', 'penyebab', 'keyakinan', 'catatan'],
  additionalProperties: false,
}

const SKEMA_VERIFIKASI = {
  type: 'object',
  properties: {
    tempat_sama: { type: 'boolean' },
    bukti_tempat: { type: 'string' },
    sudah_bersih: { type: 'boolean' },
    kelas_sesudah: { type: 'string', enum: KELAS },
    skor_sumbatan_sesudah: { anyOf: [{ type: 'number' }, { type: 'null' }] },
    keyakinan: { type: 'string', enum: KEYAKINAN },
    catatan: { type: 'string' },
  },
  required: ['tempat_sama', 'bukti_tempat', 'sudah_bersih', 'kelas_sesudah', 'skor_sumbatan_sesudah', 'keyakinan', 'catatan'],
  additionalProperties: false,
}

const SKALA = `Kelas sumbatan dan rentang skor_sumbatan (0 sampai 1, makin besar makin tersumbat):
- bersih: 0 sampai 0,15. Aliran lancar, tidak ada sampah berarti.
- ringan: 0,15 sampai 0,40. Sedikit sampah atau endapan, aliran masih lancar.
- sedang: 0,40 sampai 0,70. Sekitar separuh lebar saluran tertutup.
- berat: 0,70 sampai 1. Sebagian besar saluran tertutup, air tertahan.
- tidak_terlihat: isi saluran tidak tampak (tertutup beton, gelap, foto buram, atau bukan foto saluran). skor_sumbatan null, penyebab kosong.
penyebab hanya dari: plastik, sedimen, daun_ranting, puing. Kosongkan bila bersih.
keyakinan: tinggi bila foto jelas, sedang bila sebagian terhalang, rendah bila ragu.
catatan: satu kalimat bahasa Indonesia untuk lurah, sebut yang terlihat.`

const PROMPT_LAPOR = (jenis) => `Kamu menilai foto saluran drainase permukiman di Kota Bandung untuk aplikasi pencegahan genangan RIVORA.
Pelapor memilih jenis saluran: ${jenis}. Isi jenis_saluran sesuai yang terlihat di foto (terbuka, gorong_gorong, atau inlet_jalan).

${SKALA}

Nilai hanya dari yang terlihat. Jangan menebak isi bagian yang tidak tampak.`

const PROMPT_VERIFIKASI = `Kamu memverifikasi pembersihan saluran drainase untuk aplikasi RIVORA.
Gambar pertama adalah foto SEBELUM dibersihkan, gambar kedua foto SESUDAH dibersihkan oleh petugas.
Petugas bisa saja memotret selokan lain yang sudah bersih. Tugas pertamamu memastikan keduanya saluran yang SAMA.

Langkah 1, tempat_sama:
- Bandingkan penanda yang tidak berubah saat dibersihkan: bentuk dan lebar saluran, bahan dan pola dinding atau
  tepi (bata, beton, retakan, noda), tutup atau kisi, pipa yang masuk, tiang, pagar, tembok, pohon, trotoar, jalan, bangunan.
- Sampah, air, dan endapan BOLEH berbeda (itu yang dibersihkan), jadi jangan dipakai sebagai bukti tempat.
- tempat_sama true hanya bila minimal dua penanda tetap cocok. Bila penanda berbeda, atau tidak cukup penanda
  untuk memastikan, tempat_sama false. Lebih baik menolak daripada meloloskan selokan lain.
- bukti_tempat: satu kalimat, sebut penanda yang cocok atau yang berbeda.

Langkah 2, nilai kondisi pada foto SESUDAH dengan skala di bawah.
sudah_bersih true hanya bila tempat_sama true DAN kelas_sesudah bersih atau ringan.
Bila tempat_sama false, catatan menjelaskan bahwa foto sesudah tampak di tempat yang berbeda.

${SKALA}`

let klien = null
function ambilKlien() {
  if (module.exports._klien) return module.exports._klien // celah untuk ai.test.js
  if (!process.env.AI_API_KEY) return null
  klien ??= new Anthropic({ apiKey: process.env.AI_API_KEY, timeout: BATAS_MS, maxRetries: 0 })
  return klien
}

const PANGGILAN_LAPOR = { effort: 'low', timeout: BATAS_MS }
const PANGGILAN_VERIFIKASI = { effort: 'medium', timeout: BATAS_VERIFIKASI_MS }

const gambar = (buf, mimeType) => ({
  type: 'image',
  source: { type: 'base64', media_type: mimeType || 'image/jpeg', data: buf.toString('base64') },
})

/** Satu panggilan model + validasi. Melempar Error bila gagal supaya bisa diulang. */
async function panggil(isi, skema, validasi, { effort, timeout }) {
  const res = await ambilKlien().messages.create(
    {
      model: process.env.AI_MODEL || 'claude-opus-5-5',
      max_tokens: 4000,
      output_config: { effort, format: { type: 'json_schema', schema: skema } },
      messages: [{ role: 'user', content: isi }],
    },
    { timeout }
  )
  if (res.stop_reason === 'refusal') throw new Error(`model menolak (${res.stop_details?.category ?? 'tanpa kategori'})`)
  if (res.stop_reason === 'max_tokens') throw new Error('keluaran terpotong (max_tokens)')
  const teks = res.content.find((b) => b.type === 'text')?.text
  if (!teks) throw new Error('model tidak mengembalikan teks')
  let data
  try {
    data = JSON.parse(teks)
  } catch {
    throw new Error('JSON tidak valid')
  }
  const v = validasi(data)
  if (!v.ok) throw new Error(`validasi gagal: ${v.alasan}`)
  return v.result
}

// contoh = null → tidak ada hasil contoh walau DEMO_MODE (verifikasi: gagal tetap gagal).
async function jalankan(nama, isi, skema, validasi, contoh, opsi = PANGGILAN_LAPOR) {
  const mulai = Date.now()
  let alasan = 'AI_API_KEY belum diisi'
  if (ambilKlien()) {
    for (let i = 1; i <= PERCOBAAN; i++) {
      // Gangguan jaringan sesaat ("Connection error") sering gagal lagi kalau langsung diulang.
      if (i > 1) await new Promise((r) => setTimeout(r, module.exports._jedaUlangMs ?? 1000))
      try {
        const result = await panggil(isi, skema, validasi, opsi)
        console.log(`[ai] ${nama} sumber=model percobaan=${i} durasi=${Date.now() - mulai}ms`)
        return { ok: true, sumber: 'model', result }
      } catch (e) {
        alasan = e instanceof Anthropic.APIError ? `API ${e.status ?? 'koneksi'}: ${e.message}` : e.message
        console.warn(`[ai] ${nama} percobaan=${i} gagal: ${alasan}`)
      }
    }
  }
  if (contoh && process.env.DEMO_MODE === '1') {
    console.log(`[ai] ${nama} sumber=demo (${alasan}) durasi=${Date.now() - mulai}ms`)
    return { ok: true, sumber: 'demo', result: contoh() }
  }
  console.log(`[ai] ${nama} gagal (${alasan}) durasi=${Date.now() - mulai}ms`)
  return { ok: false, alasan }
}

/**
 * Menilai tingkat sumbatan dari foto saluran.
 * @param {{ foto: Buffer, mimeType: string, jenisSaluran: 'terbuka'|'gorong_gorong'|'inlet_jalan' }} input
 * @returns {Promise<{ ok: true, sumber: 'model'|'demo', result: object } | { ok: false, alasan: string }>}
 */
async function analyzeReport({ foto, mimeType, jenisSaluran }) {
  const isi = [gambar(foto, mimeType), { type: 'text', text: PROMPT_LAPOR(jenisSaluran) }]
  return jalankan('analyzeReport', isi, SKEMA_LAPORAN, validasiLaporan, () => contohLaporan(jenisSaluran))
}

/**
 * Membandingkan foto sebelum dan sesudah dibersihkan.
 * @param {{ fotoSebelum: Buffer, fotoSesudah: Buffer, mimeType: string }} input
 * @returns {Promise<{ ok: true, sumber: 'model'|'demo', result: object } | { ok: false, alasan: string }>}
 */
async function verifyCleaning({ fotoSebelum, fotoSesudah, mimeType }) {
  const isi = [
    { type: 'text', text: 'Foto SEBELUM:' },
    gambar(fotoSebelum, mimeType),
    { type: 'text', text: 'Foto SESUDAH:' },
    gambar(fotoSesudah, mimeType),
    { type: 'text', text: PROMPT_VERIFIKASI },
  ]
  // Tanpa hasil contoh: verifikasi yang tidak dinilai AI tidak boleh lolos sebagai "bersih".
  return jalankan('verifyCleaning', isi, SKEMA_VERIFIKASI, validasiVerifikasi, null, PANGGILAN_VERIFIKASI)
}

module.exports = { analyzeReport, verifyCleaning, _klien: null, _jedaUlangMs: undefined }

// Validasi keluaran model (SRS backend bagian 10, RENCANA_FINAL bagian 5).
// Mengembalikan { ok: true, result } dengan nilai yang sudah dirapikan, atau { ok: false, alasan }.

const JENIS = ['terbuka', 'gorong_gorong', 'inlet_jalan']
const KELAS = ['bersih', 'ringan', 'sedang', 'berat', 'tidak_terlihat']
const PENYEBAB = ['plastik', 'sedimen', 'daun_ranting', 'puing']
const KEYAKINAN = ['rendah', 'sedang', 'tinggi']

// [ASUMSI] rentang skor per kelas. Batas dibuat inklusif di kedua sisi supaya 0,15 / 0,40 / 0,70 sah.
const RENTANG = {
  bersih: [0, 0.15],
  ringan: [0.15, 0.4],
  sedang: [0.4, 0.7],
  berat: [0.7, 1],
}

function validasiLaporan(data) {
  if (!data || typeof data !== 'object') return { ok: false, alasan: 'keluaran bukan objek JSON' }
  const { jenis_saluran, kelas_sumbatan, keyakinan, catatan } = data

  if (!JENIS.includes(jenis_saluran)) return { ok: false, alasan: `jenis_saluran tidak dikenal: ${jenis_saluran}` }
  if (!KELAS.includes(kelas_sumbatan)) return { ok: false, alasan: `kelas_sumbatan tidak dikenal: ${kelas_sumbatan}` }
  if (!KEYAKINAN.includes(keyakinan)) return { ok: false, alasan: `keyakinan tidak dikenal: ${keyakinan}` }
  if (!Array.isArray(data.penyebab)) return { ok: false, alasan: 'penyebab harus array' }
  const asing = data.penyebab.filter((p) => !PENYEBAB.includes(p))
  if (asing.length) return { ok: false, alasan: `penyebab tidak dikenal: ${asing.join(', ')}` }

  const penyebab = [...new Set(data.penyebab)]
  const teks = typeof catatan === 'string' ? catatan.trim() : ''

  if (kelas_sumbatan === 'tidak_terlihat') {
    return {
      ok: true,
      result: {
        jenis_saluran,
        saluran_terlihat: false,
        kelas_sumbatan,
        skor_sumbatan: null,
        penyebab: [],
        keyakinan,
        catatan: teks,
      },
    }
  }

  const skor = data.skor_sumbatan
  if (typeof skor !== 'number' || Number.isNaN(skor)) return { ok: false, alasan: 'skor_sumbatan bukan angka' }
  const [min, maks] = RENTANG[kelas_sumbatan]
  if (skor < min || skor > maks) {
    return { ok: false, alasan: `skor_sumbatan ${skor} tidak cocok dengan kelas ${kelas_sumbatan} (${min} sampai ${maks})` }
  }
  if (data.saluran_terlihat === false) return { ok: false, alasan: 'saluran_terlihat false tapi kelas bukan tidak_terlihat' }

  return {
    ok: true,
    result: {
      jenis_saluran,
      saluran_terlihat: true,
      kelas_sumbatan,
      skor_sumbatan: Math.round(skor * 100) / 100,
      penyebab: kelas_sumbatan === 'bersih' ? [] : penyebab,
      keyakinan,
      catatan: teks,
    },
  }
}

function validasiVerifikasi(data) {
  if (!data || typeof data !== 'object') return { ok: false, alasan: 'keluaran bukan objek JSON' }
  const { sudah_bersih, kelas_sesudah, skor_sumbatan_sesudah: skor, keyakinan, catatan } = data

  if (typeof sudah_bersih !== 'boolean') return { ok: false, alasan: 'sudah_bersih harus boolean' }
  if (typeof data.tempat_sama !== 'boolean') return { ok: false, alasan: 'tempat_sama harus boolean' }
  const tempat_sama = data.tempat_sama
  const bukti_tempat = typeof data.bukti_tempat === 'string' ? data.bukti_tempat.trim() : ''
  if (!KELAS.includes(kelas_sesudah)) return { ok: false, alasan: `kelas_sesudah tidak dikenal: ${kelas_sesudah}` }
  if (!KEYAKINAN.includes(keyakinan)) return { ok: false, alasan: `keyakinan tidak dikenal: ${keyakinan}` }

  if (kelas_sesudah === 'tidak_terlihat') {
    // Foto sesudah tidak bisa dinilai: tidak boleh dianggap bersih
    return {
      ok: true,
      result: {
        tempat_sama, bukti_tempat,
        sudah_bersih: false, kelas_sesudah, skor_sumbatan_sesudah: null, keyakinan, catatan: catatan?.trim() ?? '',
      },
    }
  }
  if (typeof skor !== 'number' || Number.isNaN(skor)) return { ok: false, alasan: 'skor_sumbatan_sesudah bukan angka' }
  const [min, maks] = RENTANG[kelas_sesudah]
  if (skor < min || skor > maks) {
    return { ok: false, alasan: `skor_sumbatan_sesudah ${skor} tidak cocok dengan kelas ${kelas_sesudah}` }
  }
  // [ASUMSI] "bersih" hanya bila kelas sesudah bersih atau ringan
  if (sudah_bersih && !['bersih', 'ringan'].includes(kelas_sesudah)) {
    return { ok: false, alasan: `sudah_bersih true tapi kelas_sesudah ${kelas_sesudah}` }
  }

  return {
    ok: true,
    result: {
      tempat_sama,
      bukti_tempat,
      // Selokan lain yang bersih tidak boleh menyelesaikan tugas.
      sudah_bersih: sudah_bersih && tempat_sama,
      kelas_sesudah,
      skor_sumbatan_sesudah: Math.round(skor * 100) / 100,
      keyakinan,
      catatan: typeof catatan === 'string' ? catatan.trim() : '',
    },
  }
}

module.exports = { validasiLaporan, validasiVerifikasi, JENIS, KELAS, PENYEBAB, KEYAKINAN, RENTANG }

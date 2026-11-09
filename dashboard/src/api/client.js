// Satu pintu ke backend (SRS dasbor bagian 7 dan 10).
// VITE_USE_MOCK=1 memakai tiruan di src/mocks, VITE_USE_MOCK=0 memanggil backend Express.
import { mock, alatUji } from '../mocks/server'

// Build produksi (Vercel): bawaan memanggil backend asli. Mode tiruan hanya kalau VITE_USE_MOCK=1
// diisi dengan sengaja, supaya juri tidak melihat data contoh karena env lupa diisi.
const PRODUKSI = import.meta.env.PROD
export const USE_MOCK = (import.meta.env.VITE_USE_MOCK ?? (PRODUKSI ? '0' : '1')) === '1'
export const API_URL = (import.meta.env.VITE_API_URL ?? (PRODUKSI ? '' : 'http://localhost:3000')).replace(/\/$/, '')
export const KELURAHAN_ID = import.meta.env.VITE_KELURAHAN_ID ?? '1'

// Pesan galat konfigurasi yang jelas, bukan "Tidak terhubung ke server".
function cekKonfigurasi() {
  if (!API_URL) return 'Alamat server belum diatur. Isi VITE_API_URL lalu deploy ulang.'
  if (typeof location !== 'undefined' && location.protocol === 'https:' && API_URL.startsWith('http:')) {
    return 'Alamat server harus HTTPS (VITE_API_URL), halaman HTTPS tidak boleh memanggil HTTP.'
  }
  return null
}
const BATAS_TUNGGU_MS = 15000

const KUNCI_TOKEN = 'rivora_token'

export class GalatApi extends Error {
  constructor(status, pesan) {
    super(pesan)
    this.status = status
  }
}

export const token = {
  ambil() {
    try {
      return localStorage.getItem(KUNCI_TOKEN)
    } catch {
      return null
    }
  },
  simpan(nilai) {
    try {
      localStorage.setItem(KUNCI_TOKEN, nilai)
    } catch {
      /* penyimpanan diblokir: sesi hanya bertahan sampai halaman ditutup */
    }
  },
  hapus() {
    try {
      localStorage.removeItem(KUNCI_TOKEN)
    } catch {
      /* abaikan */
    }
  },
}

// Dipasang App: dipanggil setiap ada respons 401 supaya kembali ke halaman login (FR-DB-01)
let saatTidakSah = () => {}
export const pasangPenanganan401 = (fn) => (saatTidakSah = fn)

async function minta(path, { method = 'GET', body } = {}) {
  const headers = { Accept: 'application/json' }
  const t = token.ambil()
  if (t) headers.Authorization = `Bearer ${t}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  const salahKonfigurasi = cekKonfigurasi()
  if (salahKonfigurasi) throw new GalatApi(0, salahKonfigurasi)

  let res
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      // Tunnel yang menggantung tidak boleh membuat data diam-diam basi.
      signal: AbortSignal.timeout(BATAS_TUNGGU_MS),
    })
  } catch (e) {
    throw new GalatApi(0, e?.name === 'TimeoutError' ? 'Server terlalu lama merespons' : 'Tidak terhubung ke server')
  }
  if (res.status === 204) return null
  const data = await res.json().catch(() => null)
  if (res.status === 401 && path !== '/auth/login') {
    token.hapus()
    saatTidakSah()
  }
  if (!res.ok) throw new GalatApi(res.status, data?.error ?? `Permintaan gagal (${res.status})`)
  return data
}

async function bungkusMock(janji) {
  try {
    return await janji
  } catch (e) {
    throw new GalatApi(e.status ?? 500, e.message)
  }
}

const k = KELURAHAN_ID
const asli = {
  login: (body) => minta('/auth/login', { method: 'POST', body }),
  health: () => minta('/health'),
  rwRisk: () => minta(`/rw/risk?kelurahan_id=${k}`),
  saluran: () => minta(`/saluran?kelurahan_id=${k}`),
  saluranDetail: (id) => minta(`/saluran/${id}`),
  priorities: () => minta(`/priorities?kelurahan_id=${k}`),
  petugas: () => minta('/petugas'),
  tasks: () => minta(`/tasks?kelurahan_id=${k}`),
  createTask: (body) => minta('/tasks', { method: 'POST', body }),
  demoHujan: (mmBaru) => minta('/demo/hujan', { method: 'PUT', body: { mm: mmBaru } }),
}

const tiruan = Object.fromEntries(Object.entries(mock).map(([nama, fn]) => [nama, (...a) => bungkusMock(fn(...a))]))

export const api = USE_MOCK ? tiruan : asli

if (USE_MOCK && typeof window !== 'undefined') window.__rivoraMock = alatUji

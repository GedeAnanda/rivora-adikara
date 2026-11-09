import { useCallback, useEffect, useRef, useState } from 'react'
import RiskMap from '../components/RiskMap'
import RainCard from '../components/RainCard'
import DemoRainSlider from '../components/DemoRainSlider'
import PriorityList from '../components/PriorityList'
import ManualCheckList from '../components/ManualCheckList'
import TaskList from '../components/TaskList'
import RwDetail from '../components/RwDetail'
import SaluranDetail from '../components/SaluranDetail'
import AssignDialog from '../components/AssignDialog'
import Toast from '../components/Toast'
import Ikon from '../components/Ikon'
import { usePolling } from '../hooks/usePolling'
import { api, USE_MOCK } from '../api/client'
import { LEVEL, jamWib, mm } from '../format'

const JEDA_MUAT_ULANG = 10_000 // [ASUMSI] SRS dasbor FR-DB-13

const labelLevel = (p) => (p.komponen?.sumbatan?.data_cukup === false ? 'Belum ada data' : LEVEL[p.level]?.label)

export default function Dashboard({ onKeluar }) {
  const [tab, setTab] = useState('prioritas')
  const [rwTerpilih, setRwTerpilih] = useState(null)
  const [saluranTerpilih, setSaluranTerpilih] = useState(null)
  const [detail, setDetail] = useState({ data: null, galat: null })
  const [fokus, setFokus] = useState(null)
  const [tugaskan, setTugaskan] = useState(null)
  const [toast, setToast] = useState(null)
  const [berkedip, setBerkedip] = useState(() => new Set())
  const [demoMode, setDemoMode] = useState(false)

  const terakhir = useRef({})
  const saluranRef = useRef(null)
  const timerToast = useRef(null)

  const tampilkan = useCallback((teks, jenis = 'info', lama = 4500) => {
    clearTimeout(timerToast.current)
    setToast({ teks, jenis })
    timerToast.current = setTimeout(() => setToast(null), lama)
  }, [])

  const muatDetail = useCallback(async (id) => {
    try {
      const d = await api.saluranDetail(id)
      if (saluranRef.current === id) setDetail({ data: d, galat: null })
    } catch (e) {
      if (saluranRef.current === id) setDetail((x) => ({ ...x, galat: e.message }))
    }
  }, [])

  const muat = useCallback(async () => {
    const hasil = await Promise.allSettled([api.rwRisk(), api.saluran(), api.priorities(), api.tasks()])
    if (hasil.every((h) => h.status === 'rejected')) throw hasil[0].reason
    const [rw, saluran, prioritas, tugas] = hasil.map((h) => (h.status === 'fulfilled' ? h.value : undefined))

    // FR-DB-16 [P2]: sorot RW yang levelnya berubah sejak muat sebelumnya
    const lama = terakhir.current.rw
    if (lama && rw) {
      const levelLama = new Map(lama.features.map((f) => [f.properties.rw_id, labelLevel(f.properties)]))
      const berubah = rw.features.filter((f) => levelLama.has(f.properties.rw_id) && levelLama.get(f.properties.rw_id) !== labelLevel(f.properties))
      if (berubah.length) {
        const f = berubah[0].properties
        tampilkan(`${f.nama}: ${levelLama.get(f.rw_id)} → ${labelLevel(f)}${berubah.length > 1 ? ` (+${berubah.length - 1} RW lain)` : ''}`, 'info')
        setBerkedip(new Set(berubah.map((x) => x.properties.rw_id)))
        setTimeout(() => setBerkedip(new Set()), 3000)
      }
    }

    terakhir.current = {
      rw: rw ?? terakhir.current.rw,
      saluran: saluran ?? terakhir.current.saluran,
      prioritas: prioritas ?? terakhir.current.prioritas,
      tugas: tugas ?? terakhir.current.tugas,
    }
    if (saluranRef.current) muatDetail(saluranRef.current)
    const gagal = hasil.find((h) => h.status === 'rejected')
    return { ...terakhir.current, galatSebagian: gagal?.reason?.message ?? null }
  }, [muatDetail, tampilkan])

  const { data, galat, terakhirOk, muatUlang } = usePolling(muat, JEDA_MUAT_ULANG)

  useEffect(() => {
    api
      .health()
      .then((h) => setDemoMode(!!h?.demo_mode))
      .catch(() => setDemoMode(false))
  }, [])

  const pilihSaluran = useCallback(
    (id, titik) => {
      saluranRef.current = id
      setSaluranTerpilih(id)
      setRwTerpilih(null)
      setDetail({ data: null, galat: null })
      if (titik) setFokus({ titik, kunci: Date.now() })
      muatDetail(id)
    },
    [muatDetail],
  )

  const pilihRw = useCallback((id) => {
    saluranRef.current = null
    setSaluranTerpilih(null)
    setRwTerpilih(id)
  }, [])

  const tutupDetail = () => {
    saluranRef.current = null
    setSaluranTerpilih(null)
    setRwTerpilih(null)
  }

  async function kirimSimulasi(mmBaru) {
    try {
      await api.demoHujan(mmBaru)
      await muatUlang()
    } catch (e) {
      tampilkan(`Simulasi gagal: ${e.message}`, 'galat')
    }
  }

  async function tugasTerkirim(res) {
    setTugaskan(null)
    const nama = res?.tugas?.petugas?.nama ?? 'petugas'
    if (res?.notifikasi === 'terkirim') tampilkan(`Tugas dikirim ke ${nama}`, 'sukses')
    // Tanpa FCM / HP belum terdaftar bukan kegagalan: aplikasi petugas memeriksa tugas baru tiap 30 detik.
    else if (res?.notifikasi === 'tanpa_token' || res?.notifikasi === 'nonaktif') {
      tampilkan(`Tugas dikirim ke ${nama}. Muncul di aplikasi petugas dalam ±30 detik.`, 'sukses', 6000)
    } else tampilkan('Tugas dibuat, tapi notifikasi tidak terkirim. Petugas tetap melihatnya di daftar tugas.', 'peringatan', 7000)
    await muatUlang()
  }

  const meta = data?.rw?.meta
  const simulasi = meta?.hujan_sumber === 'simulasi_demo'
  const rwAktif = data?.rw?.features.find((f) => f.properties.rw_id === rwTerpilih)?.properties
  const jumlah = {
    prioritas: data?.prioritas?.prioritas.length,
    tugas: data?.tugas?.filter((t) => t.status !== 'selesai').length,
    cek: data?.prioritas?.cek_manual.length,
  }

  return (
    <div className="aplikasi">
      <header className="kepala">
        <div className="merek">
          <img className="logo-kepala" src="/brand/rivora-logo-putih.svg" alt="RIVORA" />
          <div className="nama-kelurahan">Kelurahan {meta?.kelurahan?.nama ?? ''}</div>
        </div>
        <RainCard meta={meta} />
        <div className="kepala-kanan">
          {demoMode && (
            <details className="demo-hujan">
              <summary>Simulasi hujan</summary>
              <div className="demo-panel">
                <p>Untuk presentasi. Mengganti nilai hujan 24 jam di seluruh sistem.</p>
                <DemoRainSlider meta={meta} onKirim={kirimSimulasi} />
              </div>
            </details>
          )}
          {USE_MOCK && <span className="lencana lencana-contoh">Data contoh</span>}
          <button className="tombol-keluar" onClick={onKeluar}>
            <Ikon nama="keluar" ukuran={18} /> Keluar
          </button>
        </div>
      </header>

      {galat && (
        <div className="pita pita-kuning" role="alert">
          <Ikon nama="awan_putus" ukuran={16} /> Tidak terhubung ke server.
          {terakhirOk ? ` Menampilkan data terakhir (${jamWib(terakhirOk)}).` : ' Belum ada data yang bisa ditampilkan.'}
          <button className="tautan" onClick={muatUlang}>
            Coba lagi
          </button>
        </div>
      )}
      {!galat && data?.galatSebagian && (
        <div className="pita pita-kuning" role="alert">
          <Ikon nama="seru" ukuran={16} /> Sebagian data gagal dimuat: {data.galatSebagian}
        </div>
      )}

      <main className="tata-letak">
        <div className="kolom-peta">
          {simulasi && (
            <div className="pita pita-oranye" role="status">
              <Ikon nama="segitiga" ukuran={16} /> SIMULASI DEMO: hujan diatur {mm(meta.hujan_24j_mm)}, bukan prakiraan asli
            </div>
          )}
          <RiskMap
            rw={data?.rw}
            saluran={data?.saluran}
            rwTerpilih={rwTerpilih}
            saluranTerpilih={saluranTerpilih}
            rwBerkedip={berkedip}
            fokus={fokus}
            onPilihRw={pilihRw}
            onPilihSaluran={pilihSaluran}
            onKlikKosong={tutupDetail}
          />
        </div>

        <aside className="sisi">
          {rwAktif || saluranTerpilih ? (
            <div className="sisi-detail" key={saluranTerpilih ?? rwAktif?.rw_id}>
              <button className="tombol-kembali" onClick={tutupDetail}>
                <Ikon nama="kembali" ukuran={20} /> Kembali ke daftar
              </button>
              {rwAktif && <RwDetail props={rwAktif} saluran={data?.saluran} onPilihSaluran={pilihSaluran} />}
              {saluranTerpilih && <SaluranDetail data={detail.data} galat={detail.galat} onTugaskan={setTugaskan} />}
            </div>
          ) : (
            <>
          <div className="tab" role="tablist">
            {[
              ['prioritas', 'Perlu dibersihkan'],
              ['tugas', 'Tugas petugas'],
              ['cek', 'Cek langsung'],
            ].map(([kunci, label]) => (
              <button
                key={kunci}
                role="tab"
                aria-selected={tab === kunci}
                className={`tab-tombol${tab === kunci ? ' aktif' : ''}`}
                onClick={() => setTab(kunci)}
              >
                {label}
                {jumlah[kunci] != null && <span className="tab-jumlah">{jumlah[kunci]}</span>}
              </button>
            ))}
          </div>

          <div className="sisi-daftar" key={tab}>
            {tab === 'prioritas' && (
              <PriorityList data={data?.prioritas} saluranTerpilih={saluranTerpilih} onPilih={pilihSaluran} onTugaskan={setTugaskan} />
            )}
            {tab === 'tugas' && <TaskList tugas={data?.tugas} onPilih={pilihSaluran} />}
            {tab === 'cek' && (
              <ManualCheckList data={data?.prioritas} saluranTerpilih={saluranTerpilih} onPilih={pilihSaluran} onTugaskan={setTugaskan} />
            )}
          </div>

          <p className="petunjuk">
            Klik wilayah RW di peta untuk melihat alasan skornya.
          </p>
            </>
          )}
        </aside>
      </main>

      <footer className="kaki">
        Skor dihitung per RW, bukan per ruas jalan. Bobot 0,4/0,4/0,2 adalah asumsi awal dan akan dikalibrasi saat pilot.
      </footer>

      {tugaskan && <AssignDialog saluran={tugaskan} onTutup={() => setTugaskan(null)} onSelesai={tugasTerkirim} />}
      <Toast pesan={toast} />
    </div>
  )
}

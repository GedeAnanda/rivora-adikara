import BeforeAfter from './BeforeAfter'
import Foto from './Foto'
import { LabelDemo, LencanaKelas } from './Lencana'
import { StatusTugasAtauTombol } from './PriorityList'
import { JENIS, KEYAKINAN, PENYEBAB, STATUS_LAPORAN, angka2, tanggalWib, umur } from '../format'

/** Detail saluran dari GET /saluran/:id (FR-DB-09, FR-DB-12). */
export default function SaluranDetail({ data, galat, onTugaskan }) {
  if (galat && !data) {
    return (
      <section className="panel-detail">
        <p className="galat">{galat}</p>
      </section>
    )
  }
  if (!data) return <section className="panel-detail teks-redup">Memuat detail saluran...</section>

  const riwayat = data.riwayat ?? []
  const terbaru = riwayat[0]
  const tugasAktif = data.tugas?.find((t) => t.status !== 'selesai')
  const tugasSelesai = data.tugas?.find((t) => t.status === 'selesai')

  return (
    <section className="panel-detail">
      <p className="detail-label">Saluran #{data.saluran_id}</p>
      <h2 className="detail-h2">
        {data.rw_nama}, {JENIS[data.jenis].toLowerCase()}
      </h2>

      {terbaru ? (
        <>
          <div className="detail-gambar">
            <Foto url={terbaru.foto_url} alt={`Foto ${JENIS[data.jenis]} ${data.rw_nama}`} />
          </div>

          <div className="status-kondisi">
            <LencanaKelas kelas={terbaru.kelas} />
            {terbaru.skor_sumbatan != null && <span className="angka status-skor">{angka2(terbaru.skor_sumbatan)}</span>}
            <LabelDemo data={terbaru} />
          </div>

          <dl className="fakta">
            <div>
              <dt>Keyakinan AI</dt>
              <dd className={`ky-${terbaru.keyakinan}`}>
                {KEYAKINAN[terbaru.keyakinan]}
                {terbaru.keyakinan === 'rendah' && <span className="fakta-catatan">Perlu dikonfirmasi petugas</span>}
              </dd>
            </div>
            {terbaru.penyebab?.length > 0 && (
              <div>
                <dt>Penyebab</dt>
                <dd>{terbaru.penyebab.map((p) => PENYEBAB[p] ?? p).join(', ')}</dd>
              </div>
            )}
            {terbaru.catatan && (
              <div>
                <dt>Catatan AI</dt>
                <dd>{terbaru.catatan}</dd>
              </div>
            )}
            <div>
              <dt>Difoto</dt>
              <dd>
                {tanggalWib(terbaru.captured_at)}
                <span className="fakta-catatan">{umur(terbaru.captured_at)}</span>
              </dd>
            </div>
          </dl>
        </>
      ) : (
        <p className="teks-redup">Belum ada laporan.</p>
      )}

      <div className="detail-aksi">
        <StatusTugasAtauTombol
          tugasAktif={tugasAktif && { ...tugasAktif, petugas_nama: tugasAktif.petugas.nama }}
          onTugaskan={() => onTugaskan({ saluran_id: data.saluran_id, jenis: data.jenis, rw_nama: data.rw_nama })}
        />
      </div>

      {tugasSelesai && (
        <>
          <h3 className="subjudul">Bukti pembersihan</h3>
          <BeforeAfter tugas={tugasSelesai} />
        </>
      )}

      <h3 className="subjudul">Riwayat laporan</h3>
      <ol className="garis-waktu">
        {riwayat.map((l) => (
          <li key={l.laporan_id} style={{ '--titik': `var(--kelas-${l.kelas})` }}>
            <div className="baris-meta">
              <LencanaKelas kelas={l.kelas} />
              {l.skor_sumbatan != null && <span className="angka">{angka2(l.skor_sumbatan)}</span>}
              {l.sumber === 'verifikasi' &&
                (l.lolos_verifikasi === false ? (
                  <span className="label-bukti ditolak">Verifikasi ditolak</span>
                ) : (
                  <span className="label-bukti">Bukti pembersihan</span>
                ))}
              <LabelDemo data={l} />
            </div>
            <p className="garis-waktu-ket">
              {tanggalWib(l.captured_at)}. {STATUS_LAPORAN[l.status] ?? l.status}. Keyakinan AI {KEYAKINAN[l.keyakinan]?.toLowerCase()}.
              {l.sumber === 'verifikasi' && l.lolos_verifikasi === false && l.catatan && ` ${l.catatan}`}
            </p>
          </li>
        ))}
      </ol>
    </section>
  )
}

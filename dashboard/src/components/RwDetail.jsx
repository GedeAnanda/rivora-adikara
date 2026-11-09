import Ikon from './Ikon'
import { LencanaKelas, LencanaLevel } from './Lencana'
import { JENIS, angka2, bobot, infoLevel, mm } from '../format'

// Ambang sama dengan kalimat alasan backend (risk/data.js: ≥ 0,5 = lokasi rendah).
const lokasi = (e) => (e >= 0.5 ? 'Lokasi rendah' : 'Lokasi relatif tinggi')

/**
 * Panel "Kenapa skor ini?" (FR-DB-06). Angka diambil apa adanya dari properties.komponen
 * dan properties.alasan. Dasbor tidak menghitung ulang skor.
 */
export default function RwDetail({ props, saluran, onPilihSaluran }) {
  const k = props.komponen
  const belumAda = k.sumbatan.data_cukup === false

  const faktor = [
    { nama: 'Hujan', c: k.hujan, ket: `Prakiraan ${mm(k.hujan.mm)} dalam 24 jam` },
    {
      nama: 'Sumbatan',
      c: k.sumbatan,
      ket: belumAda
        ? 'Belum ada laporan saluran'
        : `Dari ${k.sumbatan.jumlah_saluran} saluran` + (k.sumbatan.jumlah_cek_manual ? `, ${k.sumbatan.jumlah_cek_manual} perlu cek manual` : ''),
    },
    {
      nama: 'Kerentanan',
      c: k.kerentanan,
      ket: [
        k.kerentanan.elevasi_relatif != null && lokasi(k.kerentanan.elevasi_relatif),
        k.kerentanan.jarak_genangan_m != null &&
          `${k.kerentanan.jarak_genangan_m} m dari titik genangan ${k.kerentanan.genangan_terdekat ?? ''}`.trim(),
      ]
        .filter(Boolean)
        .join(', '),
    },
  ]

  const salRw = saluran?.features.filter((f) => f.properties.rw_id === props.rw_id) ?? []

  return (
    <section className="panel-detail" style={{ '--w': infoLevel(props).warna }}>
      <p className="detail-label">Kenapa skor ini?</p>
      <div className="detail-judul">
        <h2>{props.nama}</h2>
        <LencanaLevel props={props} />
      </div>
      <p className="skor-besar">
        <span className="angka">{belumAda ? '-' : angka2(props.skor)}</span>
        <span className="skor-dari">skor risiko, dari 1,00</span>
      </p>

      {props.alasan && <p className="ringkasan-alasan">{props.alasan}</p>}

      <h3 className="subjudul">Yang dihitung</h3>
      <div className="faktor">
        {faktor.map(({ nama, c, ket }) => (
          <div key={nama} className="faktor-baris">
            <div className="faktor-atas">
              <span className="faktor-nama">{nama}</span>
              <span className="faktor-sumbang">+{angka2(c.kontribusi)}</span>
            </div>
            <div className="meter" aria-hidden="true">
              <div className="meter-isi" style={{ width: `${Math.round((c.nilai ?? 0) * 100)}%` }} />
            </div>
            <p className="faktor-ket">
              {ket}
              <span className="faktor-rumus">
                {' '}
                ({angka2(c.nilai)} × {bobot(c.bobot)})
              </span>
            </p>
          </div>
        ))}
      </div>

      <h3 className="subjudul">Saluran di {props.nama}</h3>
      {salRw.length === 0 && <p className="teks-redup">Belum ada saluran yang dilaporkan di RW ini.</p>}
      <ul className="daftar-mini">
        {salRw.map((f) => {
          const p = f.properties
          const kelas = p.perlu_cek_manual || !p.kondisi ? 'tidak_terlihat' : p.kondisi.kelas
          return (
            <li key={p.saluran_id}>
              <button
                className="tautan-baris"
                onClick={() => onPilihSaluran(p.saluran_id, [f.geometry.coordinates[1], f.geometry.coordinates[0]])}
              >
                <span className="tautan-isi">
                  <span className="tautan-judul">{JENIS[p.jenis]}</span>
                  {p.perlu_cek_manual ? <span className="teks-redup">Perlu cek manual</span> : <LencanaKelas kelas={kelas} />}
                </span>
                <span className="angka">{p.kondisi ? angka2(p.kondisi.skor_sumbatan) : ''}</span>
                <Ikon nama="panah" ukuran={18} />
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

import { useState } from 'react'
import Ikon from './Ikon'
import { API_URL } from '../api/client'

// Foto unggahan lokal backend (/uploads/...) disimpan dengan alamat server saat itu (localhost atau
// tunnel lama). Arahkan ke API_URL yang sedang dipakai. URL Supabase Storage tidak diubah.
function alamatFoto(url) {
  if (!url || !API_URL) return url
  try {
    const u = new URL(url)
    if (u.pathname.startsWith('/uploads/')) return `${API_URL}${u.pathname}`
  } catch {
    /* bukan URL absolut */
  }
  return url
}

/** Foto saluran. Gagal dimuat -> placeholder (NFR-03). Klik foto -> perbesar. */
export default function Foto({ url: urlAsli, alt, kecil, bisaPerbesar = true }) {
  const url = alamatFoto(urlAsli)
  const [gagal, setGagal] = useState(false)
  const [besar, setBesar] = useState(false)

  if (!url || gagal) {
    return (
      <div className={`foto-kosong${kecil ? ' kecil' : ''}`}>
        <Ikon nama="kamera" ukuran={kecil ? 18 : 28} />
        {!kecil && <span>Foto tidak tersedia</span>}
      </div>
    )
  }
  return (
    <>
      <img
        src={url}
        alt={alt}
        loading="lazy"
        className={`foto${kecil ? ' kecil' : ''}${bisaPerbesar ? ' bisa-klik' : ''}`}
        onError={() => setGagal(true)}
        onClick={bisaPerbesar ? () => setBesar(true) : undefined}
      />
      {besar && (
        <div className="latar" onClick={() => setBesar(false)} role="dialog" aria-label="Foto diperbesar">
          <img src={url} alt={alt} className="foto-besar" />
        </div>
      )}
    </>
  )
}

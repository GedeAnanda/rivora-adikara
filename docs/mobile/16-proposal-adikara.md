# 16 · Proposal Penyisihan ADIKARA 2026 (Software Development)

**Tanggal:** 9 November 2026 · **Repo:** `rivora-adikara`
**Tujuan:** menyiapkan proposal babak penyisihan Kompetisi Inovasi ADIKARA 2026, subdivisi Software Development, sesuai guidebook dan template "Template Software Development.docx".

## Berkas

| Berkas | Lokasi (di luar repo) |
|---|---|
| PDF untuk diunggah | `~/Downloads/Adikara/PENYISIHAN_PROPOSAL_ADIKARA2026_INOVASI_SOFTWARE_ABIS_INI_KE_WDP.pdf` (28 halaman, ±4 MB) |
| Sumber penyusun | `~/Downloads/Adikara/sumber/` |

Proposal **tidak** disimpan di repo karena memuat identitas tim (NIM, email).

## Isi sumber penyusun

| Berkas | Isi |
|---|---|
| `config.json` | Judul, nama tim, ketua dan anggota (NIM, email), tautan video, abstrak, kata kunci, daftar pustaka |
| `body.html` | BAB 1–7 |
| `mobile.html` | Bagian 7.2 (screenshot aplikasi Android) |
| `dash/`, `hp/` | Screenshot dasbor (Chrome headless 2×) dan aplikasi (emulator, data dummy `db/demo-adikara-dummy.sh`) |
| `build.mjs` | Membuat 3 PDF lewat Chrome headless (sampul; abstrak dan daftar isi bernomor i, ii; isi bernomor 1, 2, …). Halaman daftar isi diambil otomatis dari PDF isi (`pdftext.swift`), lalu ketiganya digabung (`gabung.swift`) |

Cara menyusun ulang setelah mengubah `config.json` atau isi:

```bash
cd ~/Downloads/Adikara/sumber && node build.mjs
```

Word tidak dipakai, karena akses berkas dari skrip ke Microsoft Word tertahan sandbox.

## Kepatuhan terhadap guidebook

| Aturan | Pemenuhan |
|---|---|
| A4, margin kiri 4, kanan 3, atas 3, bawah 3 cm | `@page { size: A4; margin: 3cm 3cm 3cm 4cm }` |
| Times New Roman 12, rata kanan-kiri | Semua teks isi dan tabel 12 pt. Judul sampul 14 pt. Spasi 1,5 mengikuti template |
| Maksimal 30 halaman termasuk sampul dan daftar pustaka | 28 halaman |
| Sampul memuat tim, universitas, email ketua | Mengikuti urutan template; logo Telkom University dari template |
| Struktur Software Development | Abstrak, Daftar Isi, BAB 1–7 sesuai template, Daftar Pustaka |
| Daftar pustaka Harvard | Penulis (tahun) judul, sumber, tanggal, "Tersedia di", "Diakses"; sumber tanpa tanggal ditulis "t.t." |
| Wajib mengacu SDGs 3/4/7/8/9/11 dan Asta Cita 2/4/6 | Tabel 2.2: SDG 11, 9, 3; Asta Cita 4 dan 6 |
| Orisinal, tidak mengambil proposal yang ada | Teks ditulis baru dengan sudut pandang perangkat lunak (kebutuhan, desain, implementasi, pengujian). Dari proposal CR YOUTH hanya fakta dan sumber rujukannya yang dipakai ulang, dengan sitasi |
| Tautan video di proposal | Bagian 6.6 Tautan Prototipe |

## Masih harus diisi A sebelum unggah

1. NIM ketua dan dua anggota, serta email ketua, di `config.json`. Sekarang masih berisi `[NIM]` dan `[EMAIL KETUA]`.
2. Tautan video (Google Drive atau YouTube *unlisted*) di `config.json` → `video`. Sekarang tertulis `[TAUTAN VIDEO]`.
3. Repo `GedeAnanda/rivora-adikara` masih **privat** (tanpa login, `github.com` mengembalikan 404). Kalau tautan kode sumber dipertahankan di 6.6, repo harus dibuat publik. Kalau tidak, hapus baris itu dari `body.html`.

Setelah itu, jalankan `node build.mjs` dan cek ulang jumlah halaman.

## Catatan screenshot

- Screenshot HP diambil dari emulator Pixel 8 dengan build debug yang terhubung ke backend lokal. `flutter run` mencopot build `id.rivora.rivora` lama di emulator karena version code-nya lebih tinggi.
- Peta di aplikasi hanya menggambar laporan dari HP itu sendiri dan pin tugas petugas, jadi titik laporan dummy tidak tampil di peta HP. Di dasbor, titik-titik itu tampil.
- Dasbor memuat data gladi resik pukul 17.07–17.14 WIB (laporan RW 05 yang ditugaskan ke Petugas 1). Data itu dibiarkan apa adanya.

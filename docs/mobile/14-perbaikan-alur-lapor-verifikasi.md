# 14 · Perbaikan Alur Lapor dan Verifikasi (Backend, Dasbor, Mobile)

**Tanggal:** 9 November 2026 · **Repo:** `rivora-adikara` (salinan untuk ADIKARA 2026) · **Branch:** `fix/alur-lapor-verifikasi`
**Pemicu:** dua bug yang terlihat saat uji: (1) laporan baru langsung tampil "ditugaskan ke Petugas 1" padahal lurah belum menugaskan, (2) verifikasi lolos walau foto selokan bersih diambil di tempat berbeda dari selokan kotor. A mengambil alih backend dan dasbor untuk lomba ini, lalu mengaudit seluruh alur.

## Bug 1: laporan baru langsung "ditugaskan"

**Penyebab:**
- Dengan `lokasi_demo`, semua laporan dipasang ke **satu** saluran (`DEMO_SALURAN_ID`).
- `GET /reports/:id` mencari tugas **per saluran**: tugas apa pun yang belum selesai di saluran itu ikut dianggap menangani laporan baru.
- Dasbor (`tugas_aktif` per saluran) ikut menampilkannya sebagai sedang ditugaskan.

**Perbaikan:**
- `GET /reports/:id` (`routes/reports.js`): laporan hanya dianggap ditangani oleh tugas yang (a) memakai laporan itu, (b) **dibuat sesudah** laporan masuk, atau (c) **selesai sesudah** laporan masuk. Tugas aktif yang dibuat sebelum laporan tidak dihitung.
- Pemetaan lokasi demo baru (`demo.js`):
  - Kalau `DEMO_ASAL_LAT` dan `DEMO_ASAL_LNG` diisi (titik di sekitar tempat uji), posisi HP **digeser sejajar** ke pusat kelurahan demo.
  - Jarak antar-titik tetap sama, jadi selokan berbeda menjadi saluran berbeda dan bisa ditugaskan terpisah.
  - Titik yang jatuh di luar semua RW ditempelkan ke RW terdekat (`saluran.js`, `rwTerdekat`), supaya tetap tampil di dasbor.
  - Kalau kosong, perilaku lama tetap jalan (satu saluran demo).

## Bug 2: verifikasi lolos di selokan lain

**Penyebab** (tiga lapis):
1. Dengan `lokasi_demo`, cek radius 30 m **dilewati total** (`routes/tasks.js`).
2. Di `DEMO_MODE`, kalau AI verifikasi gagal (timeout, error, validasi), backend memakai hasil contoh **"sudah bersih"** (`ai/index.js`, `demo.js`, `ai/contoh.js`). Verifikasi yang tidak dinilai AI justru lolos.
3. Prompt AI hanya menolak kalau tempatnya "jelas berbeda", tanpa field terstruktur, dengan effort `low`.

**Perbaikan:**
- **Radius 30 m tetap berlaku di mode demo.** Dengan `DEMO_ASAL`, posisi verifikasi digeser dengan cara yang sama lalu diukur ke saluran. Tanpa `DEMO_ASAL`, posisi asli HP dibandingkan dengan posisi asli foto sebelum (`laporan.geom`). Data contoh seed (foto sebelum bukan dari HP) tetap dilewati.
- **AI gagal = belum lolos.** Verifikasi tidak pernah memakai hasil contoh. Tugas tetap `dikerjakan`, saluran masuk "Cek langsung" di dasbor. Hasil contoh hanya untuk **laporan** di `DEMO_MODE` (tetap berlabel demo).
- **AI wajib memastikan tempat sama.**
  - Skema verifikasi ditambah `tempat_sama` (boolean) dan `bukti_tempat` (satu kalimat).
  - Prompt meminta AI membandingkan penanda tetap (bentuk dan dinding saluran, pipa, kisi, pagar, tiang, bangunan) dan tidak memakai sampah atau air sebagai bukti tempat.
  - `tempat_sama` hanya `true` kalau minimal dua penanda cocok; kalau ragu, tolak.
  - Effort dinaikkan ke `medium`, batas 25 detik per percobaan (2 × 25 detik, masih di bawah batas tunggu mobile 60 detik).
  - Server: `sudah_bersih` hanya `true` kalau `tempat_sama` juga `true` (`validasi.js` dan `routes/tasks.js`).

## Temuan audit dasbor yang diperbaiki

| # | Temuan | Perbaikan |
|---|---|---|
| D1 | Build produksi tanpa env jatuh diam-diam ke **data tiruan** (`VITE_USE_MOCK` bawaan `'1'`) dan `http://localhost:3000` | `api/client.js`: di build produksi bawaannya backend asli. `VITE_API_URL` kosong atau HTTP di halaman HTTPS memunculkan pesan galat yang jelas. `.env.example` diberi `VITE_USE_MOCK` dan `VITE_KELURAHAN_ID` |
| D2 | Saluran yang sudah bersih tetap di "Perlu dibersihkan" dengan tombol Tugaskan | Backend `risk/data.js`: prioritas tidak memuat kelas `bersih` dan saluran yang perlu cek manual (sama dengan kontrak mock dasbor) |
| D3 | Tombol Tugaskan muncul di "Cek langsung" walau tugas aktif, lalu klik → 409 | Backend menambahkan `tugas_aktif` ke daftar `cek_manual` |
| D4 | Percobaan verifikasi yang ditolak diberi label "Bukti pembersihan" | Backend `GET /saluran/:id` mengirim `lolos_verifikasi`. Dasbor menampilkan **"Verifikasi ditolak"** (merah) + catatan AI |
| D5 | Foto `/uploads/...` memakai alamat server lama (localhost/tunnel lama) | `Foto.jsx` mengarahkan path `/uploads/` ke `VITE_API_URL` yang sedang dipakai |
| D6 | Pita kuning "notifikasi tidak terkirim" setiap penugasan tanpa FCM | `tanpa_token`/`nonaktif` jadi pesan netral: "Muncul di aplikasi petugas dalam ±30 detik" |
| D7 | Permintaan tanpa batas waktu (tunnel menggantung = data basi tanpa galat) | `AbortSignal.timeout(15 detik)` |
| D8 | Teks "Lokasi sedang" bertentangan dengan alasan backend "lokasi rendah" | Ambang disamakan dengan backend (≥ 0,5 = lokasi rendah) |
| D9 | "Penyebab" di detail saluran hanya muncul di mode tiruan | Backend mengirim `penyebab` di riwayat `GET /saluran/:id` |

Belum dikerjakan (usulan berikutnya):
- Toast skor RW sebelum → sesudah saat skor turun tanpa ganti level.
- "Ditugaskan sejak …" dan foto sebelum milik tugas di detail saluran.
- Pengecekan `/health` berkala.
- Batas laju `POST /reports` (biaya AI kalau URL tersebar).

## Mobile

Kalau AI menilai foto sesudah bersih tapi **tempatnya berbeda**, layar verifikasi dulu menulis "Masih ada sumbatan" (menyesatkan). Sekarang:
- Judul **"Foto sesudah di tempat berbeda"** dengan ikon lokasi.
- Ajakan foto ulang saluran yang sama dari sudut yang mirip.
- Kalimat `bukti_tempat` dari AI ditampilkan.
- AI gagal (`ai_sumber: gagal`) menampilkan "Penilaian AI belum berhasil. Kirim ulang foto; kalau tetap gagal, lurah akan mengecek langsung", bukan "foto kurang jelas".

`VerificationResult` membaca `tempat_sama` dan `bukti_tempat`. Backend lama tanpa field ini dianggap tempat sama.

## Hasil uji

| Uji | Hasil |
|---|---|
| Backend `npm test` | **22/22** (+7: `tempat_sama`, verifikasi gagal di `DEMO_MODE` tetap gagal, pemetaan lokasi demo, `cadanganDemo`) |
| Mobile `flutter analyze` / `flutter test` | Bersih / **79/79** (+3 di `test/tahap14_test.dart`) |
| Dasbor `npm run lint` / `npm run build` | 0 error (1 peringatan lama `DemoRainSlider`) / OK |
| Ujung ke ujung (PostGIS lokal di Docker, `DEMO_MODE=1`, `DEMO_ASAL` diisi, tanpa kunci AI) | Lihat tabel di bawah |

| # | Skenario | Hasil |
|---|---|---|
| 1 | Lapor selokan A | Saluran baru di RW 05, status `dikirim`, tugas `null` |
| 2 | Lurah menugaskan saluran A, lalu lapor lagi di selokan A (3 m) | Laporan kedua digabung ke saluran A, **tugas `null`, "Belum ditugaskan"** |
| 3 | Lapor selokan C (±150 m dari A) | Saluran **berbeda**, masuk RW 05, tampil di dasbor tanpa tugas |
| 4 | Verifikasi tugas A dari selokan C | **Ditolak 400**: "Kamu berjarak 163 m dari saluran" |
| 5 | Verifikasi tugas A di selokan A, AI tidak tersedia | 200, tugas tetap `dikerjakan`, `sudah_bersih: false` (dulu lolos sebagai "bersih" contoh) |
| 6 | Tanpa `DEMO_ASAL` (perilaku lama): verifikasi dari 158 m | **Ditolak 400** (dulu lolos) |
| 7 | Dasbor | Prioritas 7 saluran tanpa yang bersih; Cek langsung menampilkan "Ditugaskan ke Petugas 1" tanpa tombol Tugaskan; riwayat menampilkan "Verifikasi ditolak" |

Penilaian `tempat_sama` oleh AI asli **belum diuji dengan foto selokan asli**, karena server uji sengaja tanpa kunci AI. Uji di lapangan: lapor selokan kotor, lalu verifikasi memakai foto selokan lain yang bersih (dalam 30 m) → harus "Foto sesudah di tempat berbeda".

Database uji: kontainer Docker `rivora-uji` (PostGIS 17, port 55432), bukan database Supabase tim. `db/schema.sql` menghapus semua tabel, jadi **jangan pernah** dijalankan ke database tim.

## Konfigurasi baru

| Env | Isi |
|---|---|
| `DEMO_ASAL_LAT`, `DEMO_ASAL_LNG` | Koordinat kira-kira tempat uji (mis. selokan dekat rumah, dari Google Maps). Selokan dalam ±400 m dari titik ini jatuh di dalam wilayah demo |
| `VITE_USE_MOCK` | `0` untuk backend asli (bawaan build produksi) |

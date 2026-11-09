# Dokumentasi Mobile: Aplikasi Pelapor RIVORA

**Pemilik:** A · Mobile developer · **Branch:** `feature/mobile`
**Kode:** `mobile/` (Flutter, Android) · **Acuan:** proposal 3.1–3.4, Tabel 3, 12, 13, 14
**Kebutuhan (PRD & SRS):** [SRS.md](SRS.md)

Aplikasi pelapor untuk petugas kebersihan, siskamling, dan warga: foto saluran langsung dari kamera, GPS dan waktu tercatat otomatis, lalu hasil analisis AI ditampilkan.

## Log dokumen per tahap

| No | Dokumen | Isi | Jam (Tabel 14) | Status |
|---|---|---|---|---|
| 00 | [00-design-system.md](00-design-system.md) | Warna light/dark + rasio kontras, font, spasi, komponen, checklist | – | Dipakai semua layar |
| 00b | [00b-logo-ikon-aplikasi.md](00b-logo-ikon-aplikasi.md) | Logo "Ombak" + palet biru air: ikon launcher Android (adaptive, themed), logo di app, tema Flutter biru. Panduan merek: [../BRAND.md](../BRAND.md) | – | Selesai, 44 tes lulus, teruji di emulator light/dark + app drawer |
| 01 | [01-alur-lapor.md](01-alur-lapor.md) | Kamera, GPS, jenis saluran, kirim, hasil AI | 1–5 | Selesai, teruji di emulator (mode contoh). Tampilan didesain ulang di 02 |
| 02 | [02-status-dan-tugas.md](02-status-dan-tugas.md) | Login + peran, navigasi bawah, Beranda baru, Laporan saya + timeline, tab Tugas | 5–8 | Selesai, teruji di emulator (mode contoh) |
| 03 | [03-verifikasi-dan-notifikasi.md](03-verifikasi-dan-notifikasi.md) | Foto sesudah + verifikasi AI + skor RW turun, notifikasi tugas (cek berkala + FCM), logo Mata Air di app, motion | 8–10 | Selesai, teruji di emulator (mode contoh). FCM aktif setelah `google-services.json` dipasang |
| 04 | [04-redesign-modern.md](04-redesign-modern.md) | Redesign berbasis riset: hero prakiraan hujan Open-Meteo, tab Peta (flutter_map + OSM), beranda baru, large title, indikator langkah | – | Selesai, teruji di emulator light/dark |
| 05 | [05-audit-qa.md](05-audit-qa.md) | Audit QA: kontrak disamakan dengan backend SRS bagian 7, warga tanpa login + Masuk petugas, laporan disimpan di HP, risiko RW di wilayahmu + poligon peta, Mulai kerjakan, label demo, ikon Phosphor + piktogram saluran | – | Selesai, 39 tes lulus, teruji di emulator light/dark. Belum diuji ke backend asli |
| 06 | [06-ramah-warga.md](06-ramah-warga.md) | Tampilan ramah warga: kalimat kesimpulan + saran, meteran risiko tiga warna, gambar tingkat sumbatan, keyakinan AI dalam kata, peta kecil pengganti koordinat; angka dan rumus pindah ke lembar "Cara RIVORA menilai" | – | Selesai, 44 tes lulus, teruji di emulator light/dark |
| 07 | [07-fcm-dan-lokasi-demo.md](07-fcm-dan-lokasi-demo.md) | Langkah membuat Firebase (package `id.rivora.rivora`), payload notifikasi `type`/`jenis` diterima, build `LOKASI_DEMO=true` untuk demo di luar wilayah pilot | – | Selesai, 48 tes lulus. FCM menunggu `google-services.json` |
| 08 | [08-qa-rebrand-biru.md](08-qa-rebrand-biru.md) | QA rebrand biru (logo Ombak): kontras palet, splash Android 12+ biru, garis tepi logo header, baris README ganda dihapus | – | Selesai, 48 tes lulus, teruji di emulator light/dark |
| 09 | [09-responsif-dan-performa.md](09-responsif-dan-performa.md) | Uji HP kecil 360 dp + huruf 130%: 1 overflow + 7 tampilan terpotong diperbaiki (`TombolBerpasangan`, `layarSempit`); APK arm64 19,9 MB, buka ~2,1 dtk (release) | – | Selesai, 56 tes lulus |
| 10 | [10-uji-backend-asli.md](10-uji-backend-asli.md) | Uji ujung ke ujung ke backend asli (tunnel): login, `POST /devices`, FCM, peta, tugas, lapor, verifikasi `lokasi_demo` → RW 05 0,33 → 0,18; chip level sama dirapikan | – | Selesai. Notifikasi di bilah (app di latar belakang) belum diuji |
| 11 | [11-uji-sistem-penuh.md](11-uji-sistem-penuh.md) | Uji sistem penuh isi `dev`: dasbor (lurah) → backend lokal + AI asli → HP (petugas) → dasbor; tes otomatis backend 15/15, dasbor build OK, mobile 58/58; 2 perbaikan mobile (Mulai kerjakan 404, Penyebab disembunyikan) | – | Selesai. Menunggu B: `PATCH /tasks/:id` |
| 12 | [12-ikon-dan-font.md](12-ikon-dan-font.md) | Ikon Phosphor → Lucide (satu keluarga, tab aktif bobot 600, ikon jenis saluran dan cuaca juga Lucide); font Atkinson Hyperlegible → Plus Jakarta Sans (angka 0 tanpa garis miring, angka tabular). Peta RW lingkaran radius sempat dicoba lalu dikembalikan ke poligon | – | Selesai, 62 tes lulus, teruji di emulator light/dark |
| 13 | [13-perbaikan-audit-alur.md](13-perbaikan-audit-alur.md) | Perbaikan audit alur: layanan petugas ikut sesi (cek berkala tidak mati setelah login; 401 mengosongkan tugas; respons sesi lama dibuang), laporan baru tidak tertimpa refresh, GPS cadangan harus ≤ 2 menit dan ≤ 50 m, ketuk notifikasi menunggu muat, foto server sebagai cadangan, respons 2xx rusak jadi error. #5, #6, #7 (endpoint) untuk B | – | Selesai, 76 tes lulus, tugas masuk lewat cek berkala teruji di emulator |
| 14 | [14-perbaikan-alur-lapor-verifikasi.md](14-perbaikan-alur-lapor-verifikasi.md) | (Repo ADIKARA) Bug laporan langsung "ditugaskan" dan verifikasi lolos di selokan lain: tugas per laporan, pemetaan lokasi demo `DEMO_ASAL`, radius 30 m berlaku di mode demo, AI verifikasi gagal tidak lolos, `tempat_sama` dari AI; 9 perbaikan dasbor (mode tiruan di produksi, saluran bersih di prioritas, Tugaskan di cek langsung, label verifikasi ditolak, dll.); layar "Foto sesudah di tempat berbeda" | – | Selesai, backend 22/22, mobile 79/79, uji ujung ke ujung di PostGIS lokal. `tempat_sama` belum diuji dengan foto asli |
| 15 | [15-menjalankan-demo-adikara.md](15-menjalankan-demo-adikara.md) | (Repo ADIKARA) Backend di Mac (PostGIS Docker, port 3100, AI asli) + Cloudflare Quick Tunnel, APK `RIVORA-adikara.apk`, env Vercel dasbor, `DEMO_ASAL`, urutan menyalakan ulang, checklist rekam | – | Backend + tunnel jalan; APK jadi, belum dipasang di HP |
| 16 | [16-proposal-adikara.md](16-proposal-adikara.md) | (Repo ADIKARA) Proposal penyisihan ADIKARA 2026 subdivisi Software Development: 28 halaman, format guidebook (A4, margin 4/3/3/3, TNR 12, Harvard), SDG 11/9/3 + Asta Cita 4/6, screenshot dasbor dan aplikasi dengan data dummy; sumber penyusun di `~/Downloads/Adikara/sumber` (di luar repo) | – | PDF jadi; NIM, email ketua, dan tautan video masih placeholder; repo masih privat |

Setiap tahap baru ditambah satu file `NN-nama-tahap.md` dan satu baris di tabel ini.

## Menjalankan

```bash
cd mobile
flutter pub get
```

| Kondisi | Perintah |
|---|---|
| Backend belum ada (mode contoh; warga tanpa login, "Masuk petugas" → "Isi akun contoh petugas") | `flutter run` |
| Emulator + backend di laptop | `flutter run --dart-define=API_URL=http://10.0.2.2:3000 --dart-define=ALLOW_MOCK_LOCATION=true` |
| HP asli + backend di laptop (satu WiFi/hotspot) | `flutter run --dart-define=API_URL=http://<IP-laptop>:3000` |
| HP asli + backend sudah deploy | `flutter run --dart-define=API_URL=https://<domain-backend>` |
| Demo di luar wilayah pilot (tempat pitching), backend `DEMO_MODE=1` | `flutter run --dart-define=API_URL=https://<domain-backend> --dart-define=LOKASI_DEMO=true` |

- `10.0.2.2` = alamat laptop dari dalam emulator Android.
- `ALLOW_MOCK_LOCATION=true` hanya untuk emulator. Di HP asli jangan dipakai, karena pemeriksaan lokasi palsu adalah bagian dari pencegahan laporan palsu (Tabel 3).
- Build APK untuk demo: `flutter build apk --release --split-per-abi --dart-define=API_URL=https://<domain-backend>` → pakai `app-arm64-v8a-release.apk` (±20 MB)
- Push FCM: buat proyek Firebase dengan package `id.rivora.rivora` ([07](07-fcm-dan-lokasi-demo.md)), taruh `google-services.json` di `mobile/android/app/` (jangan di-commit). Tanpa file ini app tetap jalan dengan cek tugas berkala. Langkah lengkap: [03-verifikasi-dan-notifikasi.md](03-verifikasi-dan-notifikasi.md#menyalakan-fcm).

## Struktur `mobile/lib`

```
lib/
├── main.dart                     # MaterialApp, tema light/dark, shell (warga tanpa login)
├── app_keys.dart                 # navigatorKey, messengerKey, layarFokus
├── config.dart                   # API_URL, ALLOW_MOCK_LOCATION (--dart-define)
├── theme/
│   ├── app_theme.dart            # Token desain (lihat 00-design-system.md)
│   └── rivora_icons.dart         # RIcons: ikon Lucide (paket lucide_icons_flutter)
├── models/
│   ├── ai_result.dart            # Keluaran AI, format Lampiran C
│   ├── jenis_saluran.dart        # terbuka | gorong_gorong | inlet_jalan
│   ├── report.dart               # Laporan (backend 7.2/7.3: tugas, bukti)
│   ├── rw_risk.dart              # Risiko RW dari GET /rw/risk + titik di poligon
│   ├── session.dart              # Sesi petugas (pengguna bersarang)
│   ├── task.dart                 # Tugas petugas (backend 7.9)
│   └── verification.dart         # Hasil verifikasi + level risiko RW
├── services/
│   ├── api_client.dart           # HttpApiClient + MockApiClient
│   ├── location_service.dart     # Izin + posisi GPS
│   ├── repositories.dart         # Laporan (disimpan di HP), tugas, risiko RW
│   ├── session_services.dart     # Pemilik layanan petugas (tugas, cek berkala, push) yang ikut sesi
│   ├── session_store.dart        # Simpan/muat sesi
│   ├── task_watcher.dart         # Cek tugas berkala (notifikasi)
│   ├── push_service.dart         # Push FCM (opsional)
│   └── weather_service.dart      # Prakiraan hujan Open-Meteo
├── screens/
│   ├── login_screen.dart         # Masuk petugas (opsional, hanya role petugas)
│   ├── app_shell.dart            # Navigasi bawah
│   ├── home_screen.dart          # Beranda (hujan, lapor, tugas terdekat, peta, status)
│   ├── map_screen.dart           # Tab Peta
│   ├── lapor_flow.dart           # Penjelasan izin → izin lokasi → kamera
│   ├── camera_screen.dart        # Kamera in-app (tanpa galeri)
│   ├── report_form_screen.dart   # Konfirmasi + pilih jenis saluran
│   ├── result_screen.dart        # Hasil analisis AI
│   ├── reports_screen.dart       # Laporan saya
│   ├── report_detail_screen.dart # Detail + timeline
│   ├── tasks_screen.dart         # Tugas (petugas)
│   ├── task_detail_screen.dart   # Detail tugas
│   └── verify_screen.dart        # Verifikasi foto sesudah
├── widgets/                      # Komponen bersama (risk_card, risk_meter, sumbatan_visual, lokasi_mini, rivora_map, …)
└── utils/
    ├── format.dart               # Waktu, koordinat, desimal, jarak
    └── maps.dart                 # Buka Google Maps
```

Font: `mobile/assets/fonts/` (Plus Jakarta Sans 400–800, OFL). Ikon: paket `lucide_icons_flutter` (ISC).

## Cek sebelum commit

```bash
cd mobile
dart format lib test
flutter analyze
flutter test
```

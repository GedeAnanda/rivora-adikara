# 15 · Menjalankan Demo ADIKARA (Backend di Mac + Tunnel)

**Tanggal:** 9 November 2026 · **Repo:** `rivora-adikara`
**Tujuan:** backend dengan perbaikan [14](14-perbaikan-alur-lapor-verifikasi.md) berjalan untuk rekam video ADIKARA, terpisah dari backend dan database CR YOUTH.

```
HP (data seluler, di selokan)
   │  HTTPS
   ▼
Cloudflare Quick Tunnel (https://<acak>.trycloudflare.com)
   │
   ▼
Mac di rumah: backend RIVORA (port 3100) → PostGIS di Docker (port 55432)
                     └→ Claude (AI vision) untuk lapor dan verifikasi
```

## Komponen

| Bagian | Isi |
|---|---|
| Database | Kontainer Docker `rivora-uji`: `postgis/postgis:17-3.5` (amd64, jalan lewat emulasi di Apple Silicon), port 55432. **Bukan** Supabase tim |
| Backend | `node backend/src/index.js` dijalankan dari akar `~/rivora-adikara` (membaca `~/rivora-adikara/.env`), port 3100 |
| `.env` (tidak di-commit, izin 600) | `PORT`, `DATABASE_URL` (Docker lokal), `DB_SSL=0`, `JWT_SECRET` (acak), `SEED_PASSWORD`, `AI_API_KEY` dan `AI_MODEL` (disalin dari `.env` lokal tim, seizin A), `DEMO_MODE=1`, `DEMO_SALURAN_ID=10`, `DEMO_ASAL_LAT/LNG`, `PUBLIC_URL` (alamat tunnel) |
| Tunnel | `cloudflared tunnel --no-autoupdate --url http://localhost:3100`, dijalankan A sendiri di terminal |
| APK | `mobile/build/app/outputs/flutter-apk/RIVORA-adikara.apk` (arm64, `API_URL` = tunnel, `LOKASI_DEMO=true`) |
| Notifikasi | Tanpa FCM (tidak ada `google-services.json` dan service account di repo ini). Tugas baru sampai lewat cek berkala tiap 30 detik |
| Mac tetap menyala | `caffeinate -dims` di latar belakang. Charger terpasang, layar laptop tidak ditutup |

## Urutan menyalakan (kalau Mac restart)

1. Buka Docker Desktop, lalu `docker start rivora-uji`.
2. `cd ~/rivora-adikara && node backend/src/index.js` (biarkan terminal terbuka).
3. Terminal lain: `cloudflared tunnel --no-autoupdate --url http://localhost:3100`. Catat alamat `https://….trycloudflare.com`.
4. **Kalau alamat tunnel berubah:**
   - Ubah `PUBLIC_URL` di `.env`, lalu restart backend.
   - Build ulang APK dengan `API_URL` baru.
   - Ganti `VITE_API_URL` di Vercel, lalu Redeploy.
5. `caffeinate -dims` supaya Mac tidak tidur.

Seed ulang (database lokal saja, menghapus semua data uji):

```bash
cd ~/rivora-adikara && PGPASSWORD=uji psql -h localhost -p 55432 -U postgres -d rivora -q -f db/schema.sql && node backend/src/seed.js
```

**Jangan** menjalankan `db/schema.sql` atau seed ke `DATABASE_URL` Supabase tim.

## Dasbor di Vercel (proyek terpisah dari CR YOUTH)

| Pengaturan | Isi |
|---|---|
| Repo / branch | `GedeAnanda/rivora-adikara`, `main` (setelah PR `fix/alur-lapor-verifikasi` di-merge) |
| Root Directory | `dashboard` (preset Vite) |
| `VITE_API_URL` | Alamat tunnel saat ini |
| `VITE_USE_MOCK` | `0` |
| `VITE_KELURAHAN_ID` | `1` |

## `DEMO_ASAL` (titik tempat uji)

Diisi koordinat kira-kira selokan tempat rekam. Selokan dalam ±400 m dari titik ini dipetakan ke wilayah demo Cisaranten Kidul dengan jarak antar-selokan tetap sama.

Kalau koordinat belum diketahui: lapor sekali di selokan saat gladi resik. Posisi asli HP tersimpan di `laporan.geom`, jadi bisa dipakai untuk mengisi `DEMO_ASAL`, lalu restart backend. APK tidak perlu dibuild ulang.

## Uji

| Uji | Hasil |
|---|---|
| `GET /health` lewat tunnel | `{"ok":true,"demo_mode":true,"ai_siap":true,"db":"ok"}`, ±1,1 detik |
| AI asli (lihat doc 14) | Lapor dan verifikasi masing-masing ±4 detik. Foto selokan lain ditolak (`tempat_sama: false`) |
| APK | Build OK (21,9 MB), alamat tunnel tertanam. Belum dipasang di HP |

## Checklist rekam

1. Pasang `RIVORA-adikara.apk` di HP (kirim lewat WhatsApp/Drive).
2. Gladi resik sekali di selokan: lapor sebagai warga → lurah menugaskan dari dasbor → masuk `petugas1` → bersihkan → foto sesudah dari titik dan sudut yang sama → AI menilai bersih.
3. Foto sebelum dan sesudah: minimal dua penanda tetap masuk bingkai (tepi beton/bata, pipa, tiang, pagar).
4. Rekam layar HP (perekam bawaan) dan layar Mac (dasbor) per adegan.

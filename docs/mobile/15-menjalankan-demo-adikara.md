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
   - Ganti `VITE_API_URL` di Vercel, lalu Redeploy (hanya kalau memakai dasbor Vercel).
5. Dasbor lokal (lihat bagian di bawah).
6. `caffeinate -dims` supaya Mac tidak tidur.

Seed ulang (database lokal saja, menghapus semua data uji):

```bash
cd ~/rivora-adikara && PGPASSWORD=uji psql -h localhost -p 55432 -U postgres -d rivora -q -f db/schema.sql && node backend/src/seed.js
```

**Jangan** menjalankan `db/schema.sql` atau seed ke `DATABASE_URL` Supabase tim.

### Mengosongkan data sebelum rekam

Tujuannya supaya demo mulai dari kosong: peta tanpa titik, "Perlu dibersihkan" 0, dan daftar laporan/tugas di aplikasi kosong. Akun, 6 RW, titik genangan, dan cache hujan tetap ada.

```bash
docker exec -e PGPASSWORD=uji rivora-uji psql -U postgres -d rivora -v ON_ERROR_STOP=1 -c "BEGIN; DELETE FROM tugas; DELETE FROM laporan; DELETE FROM saluran WHERE id <> 10; COMMIT;"
```

- Nomor id **tidak di-reset**. "Laporan saya" di HP (`rivora.laporan_saya`) menyimpan id laporan. Kalau id dipakai ulang, laporan lama dari gladi resik akan menampilkan data laporan lain.

- Saluran #10 (`DEMO_SALURAN_ID`) **tidak dihapus**. Ia menjadi jangkar mode demo: kalau `DEMO_ASAL` kosong, semua laporan masuk ke situ; kalau diisi, ia dipakai untuk mencari pusat kelurahan. Tanpa saluran ini, lapor dengan `lokasi_demo` gagal 500.
- `GET /saluran` (`routes/saluran.js`) tidak menggambar saluran yang belum punya laporan sama sekali, jadi saluran #10 tidak muncul di peta sebelum ada laporan. Skor RW dan prioritas tidak berubah, karena keduanya hanya memakai saluran yang punya kondisi.
- Hanya untuk kontainer `rivora-uji`. Perintah ini lewat `docker exec`, jadi tidak mungkin mengenai Supabase.

**Uji 9 Nov:**
- Sesudah dikosongkan:
  - Peta 0 titik, prioritas 0, RW tetap 6 ("belum ada laporan kondisi saluran").
  - `npm test` backend lulus.
- Satu laporan uji (`lokasi_demo`, AI asli) masuk ke saluran #10 RW 05 dengan status `dikirim` dan tanpa tugas, lalu muncul di peta.
- Laporan uji itu kemudian dihapus lagi. Backup data sebelum dikosongkan disimpan di folder scratchpad sesi (bukan di repo).

### Data dummy (dipakai untuk rekam)

Tujuannya supaya peta tidak kosong melompong, tapi alur demo tetap jelas.

```bash
cd ~/rivora-adikara && ./db/demo-adikara-dummy.sh
```

Skrip `db/demo-adikara-dummy.sh`:
1. Mengosongkan data (perintah di atas).
2. Mengirim 5 laporan anonim lewat API backend lokal. Foto contohnya dari Wikimedia (`dashboard/public/contoh-saluran/KREDIT.md`) dan **dinilai AI asli**, jadi bukan hasil karangan.
3. Lurah menugaskan satu saluran ke **Petugas 2**.
4. Memundurkan waktu laporan dan tugas ke 6–30 jam lalu.

Skrip menolak jalan kalau `API` bukan localhost, dan SQL-nya lewat `docker exec rivora-uji`.

| RW | Foto | Hasil AI | Status |
|---|---|---|---|
| RW 01 | `sedang-5.jpg` | Sumbatan sedang | Belum ditugaskan |
| RW 02 | `bersih-2.jpg` | Bersih | Tidak masuk prioritas |
| RW 03 | `berat-6.jpg` | Sumbatan berat | Prioritas #2, siap ditugaskan |
| RW 04 | `bersih-5.jpg` | Sumbatan ringan | Belum ditugaskan |
| **RW 05** | (kosong) | **Belum ada data** | Area untuk laporan langsung saat demo |
| RW 06 | `berat-1.jpg` | Sumbatan berat | Prioritas #1, ditugaskan ke Petugas 2 |

Hasil uji 9 Nov:
- Prioritas berisi 4 saluran, cek manual 0.
- RW 03 dan RW 06 berstatus Waspada, sisanya Aman (hujan Open-Meteo 11 mm).
- Hasil AI bisa sedikit berbeda setiap kali skrip dijalankan.

Kenapa tidak membingungkan saat demo:
- **`petugas1` tidak punya tugas** (tugas dummy milik `petugas2`), jadi tugas yang muncul di HP hanya tugas dari demo.
- Laporan dummy anonim, jadi "Laporan saya" di akun `warga` hanya berisi laporan demo. Daftar itu tersimpan di HP.
- Waktu dummy dimundurkan beberapa jam, jadi laporan demo tampil paling baru ("baru saja").
- RW 05 sengaja kosong. Tanpa `DEMO_ASAL`, laporan demo masuk saluran #10 di RW 05, sehingga RW itu berubah dari garis putus-putus menjadi berwarna di peta.
- Titik dummy berjarak lebih dari 15 m (radius gabung) dari saluran #10 dan pusat kelurahan, jadi laporan demo tidak tergabung ke saluran dummy.

**Sesudah gladi resik, sebelum rekam yang sebenarnya:**
1. Jalankan ulang skrip ini supaya data server kembali ke keadaan awal.
2. Di HP, buka Pengaturan → Aplikasi → RIVORA → Penyimpanan → **Hapus data**, lalu login lagi. Logout tidak menghapus "Laporan saya", karena daftar itu milik HP, bukan milik akun.

## Dasbor lokal di Mac (dipakai untuk rekam)

Dasbor dijalankan di Mac dan langsung memanggil backend `localhost:3100`. Tunnel hanya dipakai HP.

```bash
cd ~/rivora-adikara/dashboard && VITE_API_URL=http://localhost:3100 VITE_USE_MOCK=0 VITE_KELURAHAN_ID=1 npm run dev -- --port 5176
```

Buka `http://localhost:5176` di Chrome Mac, lalu login sebagai `lurah`.

Kelebihan dibanding Vercel:
- Lebih cepat, karena tidak lewat tunnel.
- Kalau alamat tunnel berubah, dasbor tidak perlu di-redeploy.

Foto dari HP tetap tampil, karena `Foto.jsx` mengarahkan `/uploads/` ke `VITE_API_URL`.

**Uji 9 Nov:** login `lurah` berhasil. Peta 6 RW tampil dan "Perlu dibersihkan" berisi 8 saluran. `/rw/risk`, `/saluran`, `/priorities`, `/tasks`, dan `/health` ke `localhost:3100` semuanya 200.

## Dasbor di Vercel (cadangan, proyek terpisah dari CR YOUTH)

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

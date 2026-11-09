#!/usr/bin/env bash
# Data dummy untuk rekam demo ADIKARA. Hanya untuk DB lokal Docker `rivora-uji` + backend localhost.
# Lihat docs/mobile/15-menjalankan-demo-adikara.md bagian "Data dummy".
#
# Yang dilakukan:
#   1. Kosongkan laporan, tugas, dan saluran (kecuali saluran DEMO_SALURAN_ID #10, jangkar mode demo).
#   2. Kirim 5 laporan anonim lewat API (AI asli menilai foto contoh Wikimedia, lihat KREDIT.md)
#      di RW 01, 02, 03, 04, 06. RW 05 sengaja kosong untuk laporan langsung saat demo.
#   3. Lurah menugaskan saluran RW 06 ke Petugas 2 (bukan Petugas 1, supaya aplikasi petugas1 kosong).
#   4. Mundurkan waktu laporan/tugas ke beberapa jam lalu, supaya laporan demo tampil paling baru.
set -euo pipefail
cd "$(dirname "$0")/.."

API=${API:-http://localhost:3100}
case "$API" in
  http://localhost:*|http://127.0.0.1:*) ;;
  *) echo "API harus backend lokal (localhost), bukan $API" >&2; exit 1 ;;
esac
FOTO=dashboard/public/contoh-saluran
PW=$(grep '^SEED_PASSWORD=' .env | cut -d= -f2-)
[ -n "$PW" ] || { echo "SEED_PASSWORD kosong di .env" >&2; exit 1; }

sql() { docker exec -i -e PGPASSWORD=uji rivora-uji psql -U postgres -d rivora -v ON_ERROR_STOP=1 -qAt "$@"; }
json() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log(eval(process.argv[1]))})' "$1"; }

curl -sf -m 5 "$API/health" >/dev/null || { echo "Backend $API tidak menjawab" >&2; exit 1; }

# Nomor id tidak di-reset: "Laporan saya" di HP menyimpan id laporan, jadi id lama dari gladi resik
# tidak boleh dipakai ulang oleh laporan lain.
echo "1. Kosongkan laporan, tugas, saluran"
sql -c "BEGIN; DELETE FROM tugas; DELETE FROM laporan; DELETE FROM saluran WHERE id <> 10; COMMIT;" >/dev/null

# foto jenis lat lng jam_lalu → id laporan
lapor() {
  local id
  id=$(curl -sf -m 70 -X POST "$API/reports" -F "foto=@$FOTO/$1" -F "jenis_saluran=$2" \
    -F "lat=$3" -F "lng=$4" -F "captured_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)" -F lokasi_demo=false | json 'j.id')
  sql -c "UPDATE laporan SET captured_at = now() - interval '$5 hours', created_at = now() - interval '$5 hours'
          WHERE id = $id" >/dev/null
  echo "$id"
}

echo "2. Kirim 5 laporan (AI asli, ±5 detik per foto)"
# Foto dipilih dari uji AI 9 Nov supaya peta beragam (AI bisa sedikit berbeda tiap kali):
# berat-1 → berat, berat-6 → berat, sedang-5 → sedang, bersih-5 → ringan, bersih-2 → bersih.
L_RW06=$(lapor berat-1.jpg  terbuka     -6.9420 107.6940 20)
lapor berat-6.jpg  inlet_jalan -6.9378 107.6935 6  >/dev/null  # RW 03
lapor sedang-5.jpg terbuka     -6.9377 107.6856 26 >/dev/null  # RW 01
lapor bersih-5.jpg terbuka     -6.9424 107.6862 30 >/dev/null  # RW 04
lapor bersih-2.jpg terbuka     -6.9372 107.6896 9  >/dev/null  # RW 02

echo "3. Tugaskan saluran RW 06 ke Petugas 2"
TOKEN=$(curl -sf -m 10 -X POST "$API/auth/login" -H 'content-type: application/json' \
  -d "{\"username\":\"lurah\",\"password\":\"$PW\"}" | json 'j.token')
S_RW06=$(sql -c "SELECT saluran_id FROM laporan WHERE id = $L_RW06")
P2=$(sql -c "SELECT id FROM pengguna WHERE username = 'petugas2'")
T=$(curl -sf -m 10 -X POST "$API/tasks" -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d "{\"saluran_id\":$S_RW06,\"petugas_id\":$P2}" | json 'j.id ?? j.tugas?.id')
sql -c "UPDATE tugas SET dibuat_at = now() - interval '18 hours' WHERE id = $T" >/dev/null

echo "4. Hasil"
sql -F ' | ' -c "SELECT l.id, rw.nama, l.kelas, l.ai_sumber, l.status, to_char(l.captured_at AT TIME ZONE 'Asia/Jakarta', 'DD/MM HH24:MI')
  FROM laporan l JOIN saluran s ON s.id = l.saluran_id JOIN rw ON rw.id = s.rw_id ORDER BY rw.nama"
sql -c "SELECT 'tugas aktif: ' || count(*) FROM tugas WHERE status <> 'selesai'"

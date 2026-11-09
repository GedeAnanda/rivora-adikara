import 'ai_result.dart';
import 'task.dart';

/// Level risiko RW (proposal 3.2 langkah 2). Batas skor mengikuti
/// docs/RENCANA_FINAL.md bagian 4 [ASUMSI]: aman < 0,40 · waspada < 0,70.
enum LevelRisiko {
  aman('aman', 'Aman'),
  waspada('waspada', 'Waspada'),
  risikoTinggi('risiko_tinggi', 'Risiko tinggi');

  const LevelRisiko(this.apiValue, this.label);

  final String apiValue;
  final String label;

  static LevelRisiko dariSkor(double skor) => skor < 0.40
      ? LevelRisiko.aman
      : skor < 0.70
      ? LevelRisiko.waspada
      : LevelRisiko.risikoTinggi;

  static LevelRisiko? fromApi(String? v) {
    for (final l in values) {
      if (l.apiValue == v) return l;
    }
    return null;
  }
}

/// Hasil `POST /tasks/:id/verify` (backend SRS 7.10): AI membandingkan foto
/// sebelum dan sesudah (proposal 3.2 langkah 4).
///
/// `verifikasi` bisa `null` (AI gagal menilai): tampilkan `pesan` dan tombol
/// Foto ulang (mobile SRS FR-MB-10).
class VerificationResult {
  const VerificationResult({
    required this.sudahBersih,
    required this.kelasSesudah,
    required this.keyakinan,
    required this.catatan,
    this.dinilai = true,
    this.tempatSama = true,
    this.buktiTempat,
    this.pesan,
    this.skorSumbatanSesudah,
    this.aiSumber,
    this.tugas,
    this.rw,
    this.skorRwSebelum,
    this.skorRwSesudah,
  });

  /// Tiga bentuk "AI tidak bisa menilai" diterima:
  /// - `verifikasi: null` (backend SRS 7.10),
  /// - `ai_sumber: "gagal"` + objek verifikasi cadangan (implementasi
  ///   backend `routes/tasks.js`),
  /// - `kelas_sesudah: "tidak_terlihat"` (foto tidak memperlihatkan saluran).
  /// Semuanya ditampilkan "Belum bisa dinilai" + Foto ulang, bukan
  /// "Masih ada sumbatan".
  factory VerificationResult.fromJson(Map<String, dynamic> json) {
    final v = json['verifikasi'] as Map<String, dynamic>?;
    final tugas = json['tugas'] as Map<String, dynamic>?;
    final aiSumber = json['ai_sumber'] as String?;
    final kelas = KelasSumbatan.fromApi(v?['kelas_sesudah'] as String?);
    final dinilai =
        v != null &&
        aiSumber != 'gagal' &&
        kelas != KelasSumbatan.tidakTerlihat;
    final catatan = v?['catatan'] as String? ?? '';
    return VerificationResult(
      dinilai: dinilai,
      // Backend lama tidak mengirim field ini: anggap tempatnya sama.
      tempatSama: v?['tempat_sama'] as bool? ?? true,
      buktiTempat: v?['bukti_tempat'] as String?,
      // Catatan AI menjelaskan kenapa saluran tidak terlihat; catatan
      // cadangan "gagal" ditujukan ke lurah, jadi tidak dipakai di sini.
      pesan:
          json['pesan'] as String? ??
          (!dinilai && aiSumber != 'gagal' && catatan.isNotEmpty
              ? catatan
              : null),
      sudahBersih: dinilai && (v['sudah_bersih'] as bool? ?? false),
      kelasSesudah: kelas,
      skorSumbatanSesudah: (v?['skor_sumbatan_sesudah'] as num?)?.toDouble(),
      keyakinan: v?['keyakinan'] as String? ?? 'rendah',
      catatan: catatan,
      aiSumber: aiSumber,
      tugas: tugas == null ? null : Task.fromJson(tugas),
    );
  }

  /// `false` kalau AI tidak memberi penilaian (lihat [VerificationResult.fromJson]).
  final bool dinilai;

  /// `false` kalau AI menilai foto sesudah memperlihatkan saluran lain
  /// (penanda tetap seperti dinding, pipa, atau pagar berbeda dari foto sebelum).
  final bool tempatSama;

  /// Penanda yang dipakai AI untuk menilai tempatnya sama atau berbeda.
  final String? buktiTempat;

  /// Saluran di foto sesudah bisa saja bersih, tapi bukan saluran yang ditugaskan.
  bool get tempatBerbeda => dinilai && !tempatSama;
  final String? pesan;
  final bool sudahBersih;
  final KelasSumbatan kelasSesudah;
  final double? skorSumbatanSesudah;
  final String keyakinan;
  final String catatan;

  /// `model` | `demo` [DEMO].
  final String? aiSumber;

  /// Tugas setelah diperbarui server (status `selesai` kalau bersih).
  final Task? tugas;

  /// Skor risiko RW sebelum dan sesudah, diambil dari `GET /rw/risk`
  /// sebelum dan sesudah verifikasi (bukan bagian respons verify).
  final String? rw;
  final double? skorRwSebelum;
  final double? skorRwSesudah;

  bool get adaPerubahanSkor => skorRwSebelum != null && skorRwSesudah != null;
  bool get hasilDemo => aiSumber == 'demo';

  VerificationResult denganSkorRw(
    String? rw,
    double? sebelum,
    double? sesudah,
  ) => VerificationResult(
    dinilai: dinilai,
    pesan: pesan,
    sudahBersih: sudahBersih,
    kelasSesudah: kelasSesudah,
    skorSumbatanSesudah: skorSumbatanSesudah,
    keyakinan: keyakinan,
    catatan: catatan,
    aiSumber: aiSumber,
    tugas: tugas,
    rw: rw,
    skorRwSebelum: sebelum,
    skorRwSesudah: sesudah,
  );
}

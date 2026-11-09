import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:geolocator/geolocator.dart';

import '../app_keys.dart';
import '../config.dart';
import '../models/task.dart';
import '../models/verification.dart';
import '../services/api_client.dart';
import '../services/repositories.dart';
import '../theme/app_theme.dart';
import '../utils/format.dart';
import '../widgets/ai_result_card.dart';
import '../widgets/before_after.dart';
import '../widgets/common.dart';
import '../widgets/motion.dart';
import '../widgets/report_photo.dart';
import '../widgets/risk_meter.dart';
import '../widgets/status_chip.dart';
import '../widgets/sumbatan_style.dart';
import '../widgets/sumbatan_visual.dart';
import 'lapor_flow.dart';
import '../theme/rivora_icons.dart';

enum _Tahap { tinjau, kirim, hasil }

/// Verifikasi pembersihan (proposal 3.2 langkah 4, Tabel 3): bandingkan
/// foto sebelum–sesudah, kirim, AI menilai, skor RW diperbarui.
class VerifyScreen extends StatefulWidget {
  const VerifyScreen({
    super.key,
    required this.tugas,
    required this.photo,
    required this.position,
    required this.capturedAt,
  });

  final Task tugas;
  final File photo;
  final Position position;
  final DateTime capturedAt;

  /// Jarak maksimal dari titik saluran, sama dengan aturan backend
  /// (backend SRS FR-BE-17, mobile SRS FR-MB-10). Turunan Tabel 8: foto
  /// wajib dengan GPS supaya tidak ada laporan palsu.
  static const batasJarakMeter = 30.0;

  @override
  State<VerifyScreen> createState() => _VerifyScreenState();
}

class _VerifyScreenState extends State<VerifyScreen> {
  _Tahap _tahap = _Tahap.tinjau;
  VerificationResult? _hasil;

  late final double _jarak = Geolocator.distanceBetween(
    widget.position.latitude,
    widget.position.longitude,
    widget.tugas.lat,
    widget.tugas.lng,
  );

  bool get _terlaluJauh => _jarak > VerifyScreen.batasJarakMeter;

  @override
  void initState() {
    super.initState();
    layarFokus.value++;
  }

  @override
  void dispose() {
    layarFokus.value--;
    super.dispose();
  }

  /// Mode contoh tidak memblokir, karena lokasi tugas contoh ada di Gedebage.
  /// Mode contoh tidak memeriksa jarak; build `LOKASI_DEMO` dilewatkan
  /// backend (FR-BE-21). Selain itu > 30 m diblokir seperti backend.
  bool get _diblokir =>
      _terlaluJauh && !AppConfig.useMockApi && !AppConfig.lokasiDemo;

  Future<void> _kirim() async {
    if (_tahap != _Tahap.tinjau || _diblokir) return;
    setState(() => _tahap = _Tahap.kirim);
    try {
      // Skor RW sebelum, untuk menunjukkan dampak pembersihan (proposal 3.3).
      final rw = widget.tugas.rw;
      final sebelum = (await riskRepository.refresh())?.rwBernama(rw)?.skor;
      final mentah = await api.verifyTask(
        taskId: widget.tugas.id,
        foto: widget.photo,
        lat: widget.position.latitude,
        lng: widget.position.longitude,
        capturedAt: widget.capturedAt,
      );
      final sesudah = mentah.sudahBersih
          ? (await riskRepository.refresh())?.rwBernama(rw)?.skor
          : null;
      final hasil = mentah.denganSkorRw(rw, sebelum, sesudah);
      final updated = hasil.tugas;
      if (updated != null) {
        taskRepository.replace(updated);
      } else {
        taskRepository.refresh(silent: true);
      }
      final laporanId = widget.tugas.laporanId;
      if (hasil.sudahBersih && laporanId != null) {
        reportRepository.setLocalSesudah(laporanId, widget.photo);
      }
      reportRepository.refresh(silent: true);
      hasil.sudahBersih
          ? HapticFeedback.heavyImpact()
          : HapticFeedback.mediumImpact();
      if (!mounted) return;
      setState(() {
        _hasil = hasil;
        _tahap = _Tahap.hasil;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _tahap = _Tahap.tinjau);
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  void _fotoUlang() => mulaiVerifikasi(context, widget.tugas, ganti: true);

  void _keDaftarTugas() =>
      Navigator.of(context).popUntil((route) => route.isFirst);

  Widget get _before {
    final laporanId = widget.tugas.laporanId;
    return ReportPhoto(
      file: laporanId == null ? null : reportRepository.localPhoto(laporanId),
      url: widget.tugas.fotoUrl,
      radius: 0,
      kelas: widget.tugas.ai.kelas,
      jenis: widget.tugas.jenisSaluran,
      placeholderAlignment: const Alignment(-0.5, 0),
      semanticLabel: 'Foto sebelum dibersihkan',
    );
  }

  Widget get _after => Image.file(
    widget.photo,
    fit: BoxFit.cover,
    semanticLabel: 'Foto sesudah dibersihkan',
  );

  @override
  Widget build(BuildContext context) {
    final hasil = _hasil;
    final judul = switch (_tahap) {
      _Tahap.hasil when hasil!.sudahBersih => 'Verifikasi selesai',
      _Tahap.hasil when !hasil!.dinilai => 'Belum bisa dinilai',
      _Tahap.hasil when hasil!.tempatBerbeda => 'Tempat berbeda',
      _Tahap.hasil => 'Belum bersih',
      _ => layarSempit(context) ? 'Verifikasi' : 'Verifikasi pembersihan',
    };
    return PopScope(
      canPop: _tahap != _Tahap.kirim,
      child: Scaffold(
        appBar: AppBar(
          title: Text(judul),
          automaticallyImplyLeading: _tahap == _Tahap.tinjau,
          leading: _tahap == _Tahap.hasil
              ? IconButton(
                  tooltip: 'Tutup',
                  icon: const Icon(RIcons.tutup),
                  onPressed: _keDaftarTugas,
                )
              : null,
        ),
        body: AnimatedSwitcher(
          duration: Motion.of(context, Motion.normal),
          switchInCurve: Motion.enter,
          switchOutCurve: Motion.exit,
          child: hasil == null
              ? _Tinjau(
                  key: const ValueKey('tinjau'),
                  tugas: widget.tugas,
                  before: _before,
                  after: _after,
                  mengirim: _tahap == _Tahap.kirim,
                  jarak: _jarak,
                  terlaluJauh: _terlaluJauh,
                  diblokir: _diblokir,
                  capturedAt: widget.capturedAt,
                )
              : _Hasil(
                  key: const ValueKey('hasil'),
                  hasil: hasil,
                  before: _before,
                  after: _after,
                ),
        ),
        bottomNavigationBar: SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(
              Space.lg,
              Space.sm,
              Space.lg,
              Space.lg,
            ),
            child: switch (_tahap) {
              _Tahap.tinjau || _Tahap.kirim => TombolBerpasangan(
                sekunder: OutlinedButton(
                  onPressed: _tahap == _Tahap.kirim ? null : _fotoUlang,
                  child: const Text('Foto ulang'),
                ),
                utama: FilledButton.icon(
                  onPressed: _tahap == _Tahap.kirim || _diblokir
                      ? null
                      : _kirim,
                  icon: const Icon(RIcons.verifikasi),
                  label: Text(
                    _tahap == _Tahap.kirim ? 'Memeriksa…' : 'Kirim verifikasi',
                  ),
                ),
              ),
              _Tahap.hasil when hasil!.sudahBersih => FilledButton(
                onPressed: _keDaftarTugas,
                child: const Text('Kembali ke daftar tugas'),
              ),
              _Tahap.hasil => TombolBerpasangan(
                sekunder: OutlinedButton(
                  onPressed: _keDaftarTugas,
                  child: const Text('Nanti'),
                ),
                utama: FilledButton.icon(
                  onPressed: _fotoUlang,
                  icon: const Icon(RIcons.kamera),
                  label: const Text('Foto ulang'),
                ),
              ),
            },
          ),
        ),
      ),
    );
  }
}

class _Tinjau extends StatelessWidget {
  const _Tinjau({
    super.key,
    required this.tugas,
    required this.before,
    required this.after,
    required this.mengirim,
    required this.jarak,
    required this.terlaluJauh,
    required this.diblokir,
    required this.capturedAt,
  });

  final Task tugas;
  final Widget before;
  final Widget after;
  final bool mengirim;
  final double jarak;
  final bool terlaluJauh;
  final bool diblokir;
  final DateTime capturedAt;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final rv = context.rivora;
    final lokasiWarna = terlaluJauh ? rv.waspada : rv.bersih;
    return ListView(
      padding: const EdgeInsets.fromLTRB(
        Space.lg,
        Space.sm,
        Space.lg,
        Space.xl,
      ),
      children: [
        Stack(
          children: [
            BeforeAfterCompare(before: before, after: after),
            if (mengirim)
              Positioned.fill(
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(Radii.lg),
                  child: const ScanOverlay(label: 'AI membandingkan foto…'),
                ),
              ),
          ],
        ),
        const SizedBox(height: Space.sm),
        Row(
          children: [
            Icon(RIcons.ketuk, size: 16, color: scheme.onSurfaceVariant),
            const SizedBox(width: Space.xs + 2),
            Expanded(
              child: Text(
                'Geser atau ketuk foto untuk membandingkan.',
                style: theme.textTheme.bodySmall?.copyWith(
                  color: scheme.onSurfaceVariant,
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: Space.lg),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(Space.lg),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SectionTitle('Bukti pembersihan'),
                Container(
                  padding: const EdgeInsets.all(Space.md),
                  decoration: BoxDecoration(
                    color: lokasiWarna.bg,
                    borderRadius: BorderRadius.circular(Radii.md),
                  ),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(
                        terlaluJauh ? RIcons.peringatan : RIcons.lokasi,
                        color: lokasiWarna.fg,
                      ),
                      const SizedBox(width: Space.sm),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              terlaluJauh
                                  ? '${formatJarak(jarak)} dari titik saluran'
                                  : 'Di lokasi saluran · ${formatJarak(jarak)}',
                              style: theme.textTheme.titleSmall?.copyWith(
                                color: lokasiWarna.fg,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            if (terlaluJauh)
                              Text(
                                diblokir
                                    ? 'Foto sesudah harus diambil di lokasi '
                                          '(maks. ${VerifyScreen.batasJarakMeter.round()} m).'
                                    : AppConfig.lokasiDemo
                                    ? 'Mode demo: lokasi dipetakan ke saluran '
                                          'contoh.'
                                    : 'Mode contoh: jarak tidak diperiksa.',
                                style: theme.textTheme.bodySmall?.copyWith(
                                  color: lokasiWarna.fg,
                                ),
                              ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: Space.md),
                _Info(
                  icon: RIcons.waktu,
                  text: 'Difoto ${formatWaktu(capturedAt)}',
                ),
                const SizedBox(height: Space.sm),
                _Info(
                  icon: RIcons.lokasi,
                  text: [?tugas.rw, tugas.jenisSaluran.label].join(' · '),
                ),
                const SizedBox(height: Space.sm),
                Row(
                  children: [
                    Icon(RIcons.ai, size: 20, color: scheme.onSurfaceVariant),
                    const SizedBox(width: Space.sm),
                    Text('Sebelum: ', style: theme.textTheme.bodyMedium),
                    SumbatanBadge(kelas: tugas.ai.kelas, compact: true),
                  ],
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _Hasil extends StatelessWidget {
  const _Hasil({
    super.key,
    required this.hasil,
    required this.before,
    required this.after,
  });

  final VerificationResult hasil;
  final Widget before;
  final Widget after;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final rv = context.rivora;
    final bersih = hasil.sudahBersih;
    final dinilai = hasil.dinilai;
    final aksen = bersih ? rv.bersih : rv.sedang;
    final tempatBerbeda = hasil.tempatBerbeda;
    final judul = !dinilai
        ? 'AI belum bisa menilai foto'
        : bersih
        ? 'Saluran sudah bersih'
        : tempatBerbeda
        ? 'Foto sesudah di tempat berbeda'
        : 'Masih ada sumbatan';
    final keterangan = !dinilai
        ? (hasil.pesan ??
              (hasil.aiSumber == 'gagal'
                  ? 'Penilaian AI belum berhasil. Kirim ulang foto; kalau '
                        'tetap gagal, lurah akan mengecek langsung.'
                  : 'Foto kurang jelas atau terlalu gelap. Foto ulang dari '
                        'sudut yang sama.'))
        : bersih
        ? 'AI membandingkan foto sebelum dan sesudah. Tugas tercatat selesai '
              'dan pelapor melihat foto buktinya.'
        : tempatBerbeda
        ? 'Saluran di foto sesudah tidak cocok dengan foto sebelum. Foto '
              'ulang saluran yang sama, dari sudut yang mirip dengan foto '
              'sebelum.'
        : 'Bersihkan bagian yang tersisa, lalu foto ulang dari sudut yang sama.';

    return ListView(
      padding: const EdgeInsets.fromLTRB(
        Space.lg,
        Space.sm,
        Space.lg,
        Space.xl,
      ),
      children: [
        Semantics(
          liveRegion: true,
          child: Column(
            children: [
              _PopIn(
                child: Container(
                  width: 72,
                  height: 72,
                  decoration: BoxDecoration(
                    color: aksen.bg,
                    shape: BoxShape.circle,
                  ),
                  child: Icon(
                    bersih
                        ? RIcons.centang
                        : tempatBerbeda
                        ? RIcons.lokasi
                        : RIcons.peringatan,
                    size: 40,
                    color: aksen.fg,
                  ),
                ),
              ),
              const SizedBox(height: Space.md),
              Text(
                judul,
                textAlign: TextAlign.center,
                style: theme.textTheme.headlineSmall,
              ),
              const SizedBox(height: Space.xs),
              Text(
                keterangan,
                textAlign: TextAlign.center,
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: scheme.onSurfaceVariant,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: Space.xl),
        if (bersih && hasil.adaPerubahanSkor) ...[
          _SkorRw(hasil: hasil),
          const SizedBox(height: Space.lg),
        ],
        if (hasil.hasilDemo) ...[
          Row(
            children: [
              Icon(RIcons.contoh, size: 18, color: scheme.onSurfaceVariant),
              const SizedBox(width: Space.sm),
              Expanded(
                child: Text(
                  'Hasil contoh (mode demo)',
                  style: theme.textTheme.bodyMedium,
                ),
              ),
            ],
          ),
          const SizedBox(height: Space.md),
        ],
        if (dinilai)
          Card(
            child: Padding(
              padding: const EdgeInsets.all(Space.lg),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const SectionTitle('Penilaian AI sesudah dibersihkan'),
                  Row(
                    children: [
                      SumbatanVisual(kelas: hasil.kelasSesudah, width: 80),
                      const SizedBox(width: Space.lg),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            SumbatanBadge(kelas: hasil.kelasSesudah),
                            const SizedBox(height: Space.xs),
                            Text(
                              kataSumbatan(hasil.kelasSesudah),
                              style: theme.textTheme.bodyMedium,
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  if (hasil.catatan.isNotEmpty) ...[
                    const SizedBox(height: Space.md),
                    Text(hasil.catatan, style: theme.textTheme.bodyLarge),
                  ],
                  if (tempatBerbeda &&
                      (hasil.buktiTempat?.isNotEmpty ?? false)) ...[
                    const SizedBox(height: Space.md),
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(
                          RIcons.lokasi,
                          size: 18,
                          color: scheme.onSurfaceVariant,
                        ),
                        const SizedBox(width: Space.sm),
                        Expanded(
                          child: Text(
                            hasil.buktiTempat!,
                            style: theme.textTheme.bodyMedium?.copyWith(
                              color: scheme.onSurfaceVariant,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                  const SizedBox(height: Space.md),
                  KeyakinanAi(keyakinan: hasil.keyakinan),
                ],
              ),
            ),
          ),
        const SizedBox(height: Space.lg),
        BeforeAfterCompare(before: before, after: after),
      ],
    );
  }
}

/// Risiko RW turun setelah saluran dibersihkan (proposal 3.3): penanda di
/// meteran bergeser dari level lama ke level baru. Angka hanya untuk
/// pembaca layar dan lembar "Cara RIVORA menilai" di beranda.
class _SkorRw extends StatelessWidget {
  const _SkorRw({required this.hasil});

  final VerificationResult hasil;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final sebelum = hasil.skorRwSebelum!;
    final sesudah = hasil.skorRwSesudah!;
    final levelSebelum = LevelRisiko.dariSkor(sebelum);
    final levelSesudah = LevelRisiko.dariSkor(sesudah);
    final rw = hasil.rw ?? 'RW ini';
    final turun = sesudah < sebelum;
    final pindahLevel = levelSesudah != levelSebelum;

    return Semantics(
      label:
          'Risiko $rw ${turun ? 'turun' : 'tetap'} dari ${levelSebelum.label} '
          'ke ${levelSesudah.label}. Skor ${formatDesimal(sebelum)} menjadi '
          '${formatDesimal(sesudah)}.',
      excludeSemantics: true,
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(Space.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                turun ? 'Risiko genangan $rw turun' : 'Risiko genangan $rw',
                style: theme.textTheme.titleMedium,
              ),
              const SizedBox(height: Space.md),
              // Level berubah: "Waspada → Aman". Level sama: satu chip saja
              // (bukan "Aman → Aman"); turunnya terlihat di meteran.
              Row(
                children: [
                  if (pindahLevel) ...[
                    RisikoChip(level: levelSebelum),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: Space.sm),
                      child: Icon(
                        RIcons.panah,
                        size: 18,
                        color: scheme.onSurfaceVariant,
                      ),
                    ),
                  ],
                  RisikoChip(level: levelSesudah),
                ],
              ),
              const SizedBox(height: Space.lg),
              RiskMeter(dari: sebelum, skor: sesudah),
              const SizedBox(height: Space.md),
              Text(
                pindahLevel
                    ? 'Karena saluran ini sudah bersih, $rw sekarang '
                          '${levelSesudah.label.toLowerCase()}. Warga yang '
                          'melapor ikut melihat hasilnya.'
                    : 'Saluran ini sudah bersih, jadi kemungkinan genangan '
                          'di $rw berkurang.',
                style: theme.textTheme.bodyMedium,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Info extends StatelessWidget {
  const _Info({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      children: [
        Icon(icon, size: 20, color: theme.colorScheme.onSurfaceVariant),
        const SizedBox(width: Space.sm),
        Expanded(child: Text(text, style: theme.textTheme.bodyMedium)),
      ],
    );
  }
}

/// Muncul dengan sedikit memantul. Langsung tampil kalau animasi dimatikan.
class _PopIn extends StatelessWidget {
  const _PopIn({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0.6, end: 1),
      duration: Motion.of(context, Motion.reveal),
      curve: Curves.easeOutBack,
      builder: (context, v, child) => Transform.scale(scale: v, child: child),
      child: child,
    );
  }
}

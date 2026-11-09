import 'package:flutter_test/flutter_test.dart';
import 'package:rivora/models/ai_result.dart';
import 'package:rivora/models/verification.dart';

/// Tahap 14: verifikasi menolak foto sesudah di saluran lain (tempat_sama).
void main() {
  Map<String, dynamic> respons({bool? tempatSama, bool bersih = false}) => {
    'ai_sumber': 'model',
    'verifikasi': {
      'tempat_sama': ?tempatSama,
      'bukti_tempat': 'Dinding beton, foto sebelum dinding bata',
      'sudah_bersih': bersih,
      'kelas_sesudah': 'bersih',
      'skor_sumbatan_sesudah': 0.05,
      'keyakinan': 'tinggi',
      'catatan': 'Foto sesudah tampak di tempat berbeda',
    },
  };

  test('tempat_sama false: tempat berbeda, tidak bersih, bukti terbaca', () {
    final v = VerificationResult.fromJson(respons(tempatSama: false));
    expect(v.dinilai, isTrue);
    expect(v.tempatBerbeda, isTrue);
    expect(v.sudahBersih, isFalse);
    expect(v.kelasSesudah, KelasSumbatan.bersih);
    expect(v.buktiTempat, contains('bata'));
  });

  test('backend lama tanpa tempat_sama: dianggap tempat sama', () {
    final v = VerificationResult.fromJson(respons(bersih: true));
    expect(v.tempatSama, isTrue);
    expect(v.tempatBerbeda, isFalse);
    expect(v.sudahBersih, isTrue);
  });

  test('AI gagal: bukan "tempat berbeda", tetap belum dinilai', () {
    final v = VerificationResult.fromJson({
      'ai_sumber': 'gagal',
      'verifikasi': {
        'sudah_bersih': false,
        'kelas_sesudah': 'tidak_terlihat',
        'skor_sumbatan_sesudah': null,
        'keyakinan': 'rendah',
        'catatan': 'Penilaian AI gagal, perlu dicek manual oleh lurah',
      },
    });
    expect(v.dinilai, isFalse);
    expect(v.tempatBerbeda, isFalse);
    expect(v.pesan, isNull);
  });
}

const assert = require("node:assert/strict");
const fs = require("node:fs");

const source = fs.readFileSync("index.html", "utf8");
const match = source.match(/function validateDrillPngExport\([\s\S]*?\n    }\n\n    function formatFileSize/);
assert.ok(match, "validator PNG harus tersedia di index.html");
const validatorSource = `${match[0].replace(/\n\n    function formatFileSize[\s\S]*$/, "")}`;
const validateDrillPngExport = new Function(`${validatorSource}; return validateDrillPngExport;`)();

assert.throws(() => validateDrillPngExport(null, "rekap.png", 1600, 900), /tidak tersedia/);
assert.throws(() => validateDrillPngExport(new Blob([], { type: "image/png" }), "rekap.png", 1600, 900), /kosong/);
assert.throws(() => validateDrillPngExport(new Blob(["data"], { type: "image/jpeg" }), "rekap.png", 1600, 900), /bukan PNG/);
assert.throws(() => validateDrillPngExport(new Blob(["data"], { type: "image/png" }), "rekap.png", 0, 900), /Dimensi/);
assert.deepEqual(
  validateDrillPngExport(new Blob(["data"], { type: "image/png" }), "rekap-drill.png", 1600, 900),
  { size: 4, fileName: "rekap-drill.png", width: 1600, height: 900 }
);

assert.equal(source.includes("shareDrillWhatsAppBtn"), true, "tombol Kirim WA harus tersedia");
assert.equal(source.includes("function shareDrillWhatsApp()"), true, "handler Kirim WA harus tersedia");
assert.equal(source.includes("const isRunningWeek = Boolean(selectedWeek && weekDates.includes(DASHBOARD_MIN_TODAY))"), true, "week berjalan harus terdeteksi");
assert.equal(source.includes("weekDates.filter((date) => date < DASHBOARD_MIN_TODAY)"), true, "week berjalan harus dibatasi sampai H-1");
assert.equal(source.includes("const targetDates = weekDates.length ? weekDates : dates"), true, "target mingguan harus memakai rentang week penuh");
assert.equal(source.includes("*Laporan Progres Drill Soal ${studentName}*"), true, "format laporan progres Drill harus tersedia");
assert.equal(source.includes("*${weeklyCorrect} soal benar*"), true, "ringkasan harus memakai jumlah soal benar");
assert.equal(source.includes("telah menyelesaikan *${weeklyCorrect} soal benar*"), true, "ringkasan pencapaian week harus tersedia");
assert.equal(source.includes("Ananda telah menyelesaikan *${weeklyCorrect} soal benar*"), true, "narasi harus menggunakan sapaan Ananda");
assert.equal(source.includes("target *${weeklyTarget} soal benar*"), true, "target mingguan harus tersedia");
assert.equal(source.includes("const dailyTargets = targetDates.map"), true, "target harian harus mengikuti grade dan tanggal");
assert.equal(source.includes("const weeklyTarget = dailyTargets.reduce"), true, "target mingguan harus merupakan total target harian");
assert.equal(source.includes("Target Drill: *${dailyTargetLabel} soal benar / hari*"), true, "target drill harian harus menampilkan target soal benar");
assert.equal(source.includes("const reachedTarget = weeklyTarget > 0 && weeklyCorrect >= weeklyTarget"), true, "narasi pencapaian harus memiliki kondisi target tercapai");
assert.equal(source.includes("Selamat, Ananda sudah berhasil mencapai target minggu ini"), true, "narasi target tercapai harus tersedia");
assert.equal(source.includes("menyelesaikan *${weeklyCorrect}* dari ${weeklyTarget} soal benar dengan capaian *${weeklyPercent}%*"), true, "capaian target harus menebalkan angka progres");
assert.equal(source.includes("capaian *${weeklyPercent}%*.`"), true, "narasi pencapaian tidak memakai emoji tambahan");
assert.equal(source.includes("Semoga pencapaian ini menjadi motivasi untuk terus berkembang"), true, "penutup target tercapai harus tersedia");
assert.equal(source.includes("*Jangan cepat puas, ya."), true, "motivasi lanjutan harus ditebalkan");
assert.equal(source.includes("pukul 23.59 WITA*"), true, "batas pengerjaan week harus bold");
assert.equal(source.includes("paling lambat hari *${deadlineLabel} pukul 23.59 WITA*"), true, "batas pengerjaan harus menyebut hari");
assert.equal(source.includes('"Format Harian:"'), false, "label Format Harian tidak perlu ditampilkan");
assert.equal(source.includes("Achievement: *${achievement}%*"), true, "persentase achievement harus tersedia");
assert.equal(source.includes("Jumlah Benar: ${correct} (${percentCorrect}%)"), true, "format harian harus menggabungkan jumlah dan persentase benar");
assert.equal(source.includes("window.open(`https://wa.me/?text="), true, "WhatsApp harus dibuka dengan teks laporan");
assert.equal(source.includes("navigator.share"), false, "fitur ini tidak boleh memakai Web Share API");
assert.equal(source.includes("sharePreparedDrillBtn"), false, "tombol Bagikan PNG tidak digunakan");
assert.equal(source.includes("DRILL_WHATSAPP_MODE"), false, "mode WhatsApp tidak digunakan");
assert.equal(source.includes("Simulasi: PNG siap dibagikan"), false, "status simulasi WhatsApp harus dihapus");

console.log("drill-export-validation: semua pengujian lulus");

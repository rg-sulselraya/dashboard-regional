const assert = require("node:assert/strict");
const fs = require("node:fs");

const source = fs.readFileSync("index.html", "utf8");
const match = source.match(/function validateDrillPngExport\([\s\S]*?\n    }\n\n    function formatFileSize/);
assert.ok(match, "validator PNG harus tersedia di index.html");
const validatorSource = `${match[0].replace(/\n\n    function formatFileSize[\s\S]*$/, "")}`;
const validateDrillPngExport = new Function(`${validatorSource}; return validateDrillPngExport;`)();

const shareMatch = source.match(/function canShareDrillFile\([\s\S]*?\n    }/);
assert.ok(shareMatch, "pemeriksa dukungan berbagi file harus tersedia");
const canShareDrillFile = new Function(`${shareMatch[0]}; return canShareDrillFile;`)();
const errorMatch = source.match(/function drillShareErrorStatus\([\s\S]*?\n    }/);
assert.ok(errorMatch, "klasifikasi error berbagi harus tersedia");
const drillShareErrorStatus = new Function(`${errorMatch[0]}; return drillShareErrorStatus;`)();

assert.throws(() => validateDrillPngExport(null, "rekap.png", 1600, 900), /tidak tersedia/);
assert.throws(() => validateDrillPngExport(new Blob([], { type: "image/png" }), "rekap.png", 1600, 900), /kosong/);
assert.throws(() => validateDrillPngExport(new Blob(["data"], { type: "image/jpeg" }), "rekap.png", 1600, 900), /bukan PNG/);
assert.throws(() => validateDrillPngExport(new Blob(["data"], { type: "image/png" }), "rekap.png", 0, 900), /Dimensi/);
assert.deepEqual(
  validateDrillPngExport(new Blob(["data"], { type: "image/png" }), "rekap-drill.png", 1600, 900),
  { size: 4, fileName: "rekap-drill.png", width: 1600, height: 900 }
);

const pngFile = new File(["data"], "rekap-drill.png", { type: "image/png" });
let shareCalls = 0;
const shareApi = () => { shareCalls += 1; };
const canShareApi = ({ files }) => files[0] === pngFile;
assert.equal(canShareDrillFile(shareApi, canShareApi, pngFile), true);
assert.equal(shareCalls, 0, "pemeriksaan dukungan tidak boleh memanggil share");
assert.equal(canShareDrillFile(undefined, canShareApi, pngFile), false);
assert.equal(canShareDrillFile(shareApi, undefined, pngFile), false);
assert.equal(drillShareErrorStatus({ name: "AbortError" }), "Dialog berbagi dibatalkan.");
assert.match(drillShareErrorStatus({ name: "NotAllowedError" }), /user activation|tombol Bagikan/i);
assert.equal(drillShareErrorStatus({ name: "TypeError" }), "Gagal membuka dialog berbagi.");

assert.equal(source.includes('const DRILL_WHATSAPP_MODE = "production";'), true);
assert.equal(source.includes('if (DRILL_WHATSAPP_MODE === "simulation")'), true);
assert.equal(source.includes("https://wa.me/"), false, "simulasi dan fallback tidak mogen membuka wa.me");
assert.equal(source.includes('window.open(whatsappUrl'), false, "simulasi dan fallback tidak boleh membuka popup WhatsApp");
assert.equal(source.includes('id="sharePreparedDrillBtn"'), true, "tombol Bagikan PNG harus tersedia");
const shareHandler = source.match(/function sharePreparedDrillPng\(\) \{[\s\S]*?\n    \}/)?.[0] || "";
assert.ok(shareHandler, "handler Bagikan PNG harus tersedia");
assert.equal(/await\s/.test(shareHandler), false, "handler Bagikan PNG tidak boleh await sebelum share");
assert.equal(/loadExportImage|toBlob|fetch\(|window\.open|wa\.me/.test(shareHandler), false, "handler Bagikan PNG tidak boleh melakukan proses asynchronous sebelum share");
assert.match(source, /preparedDrillShareFile\s*=\s*file/);
assert.match(source, /navigator\.share\(\{ title: "Rekap Drill Siswa"/);

console.log("drill-export-validation: semua pengujian lulus");

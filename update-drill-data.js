const fs = require("fs");
const path = require("path");
const https = require("https");

const SHEET_ID = "1Ay9OPNDLYI0SKsZ4_98y2mqR_y3mVWOwBRhpN8hADJU";
const GID = "246622240";
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${GID}`;
const ATTENDANCE_IN = path.join(__dirname, "..", "attendance-data.js");
const OUT = path.join(__dirname, "..", "drill-data.js");

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { agent: false }, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        fetchText(response.headers.location).then(resolve, reject);
        return;
      }
      if (response.statusCode !== 200) {
        reject(new Error(`Google Sheets returned ${response.statusCode}`));
        response.resume();
        return;
      }
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => resolve(body));
    }).on("error", reject);
  });
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && quoted && next === '"') {
      value += '"';
      i += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === "," && !quoted) {
      row.push(value);
      value = "";
      continue;
    }
    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
      continue;
    }
    value += char;
  }
  row.push(value);
  if (row.length > 1 || row[0]) rows.push(row);
  return rows;
}

function loadAttendanceStudents() {
  if (!fs.existsSync(ATTENDANCE_IN)) return [];
  const source = fs.readFileSync(ATTENDANCE_IN, "utf8");
  const match = source.match(/window\.ATTENDANCE_DATA\s*=\s*(.*);\s*$/s);
  if (!match) return [];
  try {
    return JSON.parse(match[1]).students || [];
  } catch (error) {
    return [];
  }
}

const students = loadAttendanceStudents();

function valueAt(row, index) {
  return index >= 0 ? String(row[index] || "").trim() : "";
}

function toNumber(value) {
  const number = Number(String(value || "").trim().replace(",", "."));
  return Number.isFinite(number) ? number : 0;
}

function classFromStudent(studentName) {
  const student = students.find((item) => item.name.toLowerCase() === String(studentName || "").trim().toLowerCase());
  return student?.class || "";
}

function normalizeDrillClass(value) {
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean)[0] || "";
}

function drillTarget(kelas) {
  return String(kelas || "").includes("12") ? 10 : 5;
}

function normalizeSheetIsoDate(value) {
  const text = String(value || "").trim();
  if (!text.match(/^\d{4}-\d{2}-\d{2}T/)) return "";
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return "";
  date.setUTCHours(date.getUTCHours() + 8);
  return date.toISOString().slice(0, 10);
}

function normalizeDrillDate(value) {
  const text = String(value || "").trim();
  if (!text) return "Tanpa tanggal";
  const sheetIso = normalizeSheetIsoDate(text);
  if (sheetIso) return sheetIso;
  const native = new Date(text);
  if (!Number.isNaN(native.getTime())) return native.toISOString().slice(0, 10);
  const monthMap = { Jan: "01", Feb: "02", Mar: "03", Apr: "04", Mei: "05", Jun: "06", Jul: "07", Agu: "08", Sep: "09", Okt: "10", Nov: "11", Des: "12" };
  const match = text.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
  if (match) return `${match[3]}-${monthMap[match[2]] || "01"}-${String(Number(match[1])).padStart(2, "0")}`;
  return text;
}

function monthNameFromDate(value) {
  if (!String(value || "").match(/^\d{4}-\d{2}-\d{2}$/)) return "";
  return new Intl.DateTimeFormat("id-ID", { month: "long" }).format(new Date(`${value}T00:00:00`));
}

function weekFromDate(value) {
  if (!String(value || "").match(/^\d{4}-\d{2}-\d{2}$/)) return "";
  const date = new Date(`${value}T00:00:00`);
  return `Week ${Math.ceil(date.getDate() / 7)}`;
}

function formatLongDate(value) {
  return new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }).format(new Date(`${value}T00:00:00`));
}

function safeFormatLongDate(value) {
  if (!String(value || "").match(/^\d{4}-\d{2}-\d{2}$/)) return String(value || "Tanpa tanggal");
  return formatLongDate(value);
}

function isHeaderLike(value) {
  const text = String(value || "").trim().toLowerCase();
  return ["nama", "nama siswa", "siswa", "kelas", "class"].includes(text);
}

function findDrillHeaderRow(rows) {
  let bestIndex = 0;
  let bestScore = -1;
  rows.slice(0, 12).forEach((row, index) => {
    const labels = row.map((cell) => String(cell || "").trim().toLowerCase());
    const has = (patterns) => labels.some((label) => patterns.some((pattern) => label.includes(pattern)));
    const score = Number(has(["nama", "siswa", "student"])) + Number(has(["tanggal", "timestamp", "date", "tgl", "waktu"])) + Number(has(["benar", "correct"])) + Number(has(["kelas", "class", "rombel"]));
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });
  return bestIndex;
}

function buildDrillData(rows) {
  const headerRowIndex = findDrillHeaderRow(rows);
  const header = (rows[headerRowIndex] || rows[0] || []).map((cell) => String(cell || "").trim().toLowerCase());
  const indexOf = (patterns) => header.findIndex((label) => patterns.some((pattern) => label.includes(pattern)));
  const subjectIndex = 10;
  const topicIndex = 11;
  const nameIndex = 21;
  const classIndex = 6;
  const dateIndex = 16;
  const monthIndex = 17;
  const weekIndex = 19;
  const correctIndex = 12;
  const wrongIndex = 13;
  const blankIndex = 14;
  const totalIndex = indexOf(["total", "jumlah"]);
  return rows.slice(headerRowIndex + 1).map((row) => {
    const student = valueAt(row, nameIndex);
    const studentClass = classFromStudent(student) || normalizeDrillClass(valueAt(row, classIndex));
    const rawDate = valueAt(row, dateIndex);
    if (!student || !studentClass || isHeaderLike(student) || isHeaderLike(studentClass)) return null;
    const correct = toNumber(valueAt(row, correctIndex));
    const wrong = toNumber(valueAt(row, wrongIndex));
    const blank = toNumber(valueAt(row, blankIndex));
    const total = totalIndex >= 0 ? toNumber(valueAt(row, totalIndex)) : correct + wrong + blank;
    const month = valueAt(row, monthIndex);
    const week = valueAt(row, weekIndex);
    const date = normalizeDrillDate(rawDate || `${month} ${week}`.trim());
    return {
      student,
      class: studentClass,
      subject: valueAt(row, subjectIndex) || "-",
      topic: valueAt(row, topicIndex) || "-",
      date,
      dateLabel: safeFormatLongDate(date),
      month: month || monthNameFromDate(date),
      week: week || weekFromDate(date),
      correct,
      wrong,
      blank,
      total,
      target: drillTarget(studentClass)
    };
  }).filter(Boolean);
}

(async () => {
  const csv = await fetchText(CSV_URL);
  const data = buildDrillData(parseCsv(csv));
  if (data.length < 100) {
    throw new Error(`Drill data looks incomplete: ${data.length} rows`);
  }
  fs.writeFileSync(OUT, `window.DRILL_DATA = ${JSON.stringify(data)};\n`);
  console.log(`Updated drill-data.js: ${data.length} drill rows`);
})();

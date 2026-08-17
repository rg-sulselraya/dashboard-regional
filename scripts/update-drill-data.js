const fs = require("fs");
const path = require("path");
const https = require("https");

const SHEET_ID = "1Ay9OPNDLYI0SKsZ4_98y2mqR_y3mVWOwBRhpN8hADJU";
const STUDENT_SHEET = "Data Siswa";
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
const BRANCH_SHEET_FALLBACKS = [
  "Bone - Ahmad Yani",
  "Bulukumba - Jend. Sudirman",
  "Gowa - Sungguminasa",
  "Makassar - Baruga",
  "Makassar - Cendrawasih",
  "Makassar - Hertasning",
  "Makassar - Perintis",
  "Makassar - Sudiang",
  "Palopo - Andi Kambo",
  "Pangkep - Sultan Hasanuddin",
  "Parepare - Mattirotasi",
  "Pinrang - Jend. Sudirman",
  "Sidrap - Jenderal Sudirman",
  "Sidrap - Jendral Sudirman",
  "Soppeng - Lalabata",
  "Tana Toraja - Makale",
  "Toraja Utara - Poros Bolu",
  "Wajo - Jend. Sudirman"
];

function isValidBranch(value) {
  return Boolean(String(value || "").trim()) && !/isi nama siswa|tanggal paid/i.test(String(value || ""));
}

function valueAt(row, index) {
  return index >= 0 ? String(row[index] || "").trim() : "";
}

function toNumber(value) {
  const number = Number(String(value || "").trim().replace(",", "."));
  return Number.isFinite(number) ? number : 0;
}

function normalizeLookup(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function classFromStudent(studentName) {
  const student = students.find((item) => item.name.toLowerCase() === String(studentName || "").trim().toLowerCase());
  return student?.class || "";
}

function attendanceStudentFromMatchedStudent(student) {
  if (!student) return null;
  const email = normalizeLookup(student.email);
  const name = normalizeLookup(student.name);
  return students.find((item) => email && normalizeLookup(item.email) === email)
    || students.find((item) => name && normalizeLookup(item.name) === name)
    || null;
}

function branchFromStudent(studentName) {
  const student = students.find((item) => item.name.toLowerCase() === String(studentName || "").trim().toLowerCase());
  return student?.branch || "";
}

function studentFromLookup(row, indexes, studentLookup) {
  const email = normalizeLookup(valueAt(row, indexes.emailIndex));
  const rawName = normalizeLookup(valueAt(row, indexes.nameIndex));
  const userSerial = normalizeLookup(valueAt(row, indexes.userIndex));
  return studentLookup.get(`email:${email}`)
    || studentLookup.get(`serial:${userSerial}`)
    || studentLookup.get(`name:${rawName}`)
    || students.find((item) => normalizeLookup(item.email) === email)
    || students.find((item) => normalizeLookup(item.name) === rawName)
    || null;
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
  const monthMap = {
    jan: "01", january: "01", januari: "01",
    feb: "02", february: "02", februari: "02",
    mar: "03", march: "03", maret: "03",
    apr: "04", april: "04",
    may: "05", mei: "05",
    jun: "06", june: "06", juni: "06",
    jul: "07", july: "07", juli: "07",
    aug: "08", august: "08", agu: "08", agustus: "08",
    sep: "09", september: "09",
    oct: "10", october: "10", okt: "10", oktober: "10",
    nov: "11", november: "11",
    dec: "12", december: "12", des: "12", desember: "12"
  };
  const idMatch = text.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (idMatch) return `${idMatch[3]}-${monthMap[idMatch[2].toLowerCase()] || "01"}-${String(Number(idMatch[1])).padStart(2, "0")}`;
  const enMatch = text.match(/^([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})/);
  if (enMatch) return `${enMatch[3]}-${monthMap[enMatch[1].toLowerCase()] || "01"}-${String(Number(enMatch[2])).padStart(2, "0")}`;
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

function isInvalidSheetValue(value) {
  const text = String(value || "").trim().toLowerCase();
  return !text || text === "#n/a" || text === "#ref!" || text === "#value!" || text === "#error!" || text === "n/a";
}

function buildStudentLookup(rows) {
  const header = rows[0] || [];
  const indexOf = (patterns) => header.findIndex((cell) => {
    const label = normalizeLookup(cell);
    return patterns.some((pattern) => label.includes(pattern));
  });
  const branchIndex = indexOf(["cabang"]);
  const serialIndex = indexOf(["user serial", "serial", "user"]);
  const emailIndex = indexOf(["email"]);
  const nameIndex = indexOf(["nama siswa", "student"]);
  const gradeIndex = indexOf(["grade"]);
  const paidDateIndex = indexOf(["tanggal paid", "paid"]);
  const statusIndex = indexOf(["status"]);
  const lookup = new Map();
  rows.slice(1).forEach((row) => {
    const name = valueAt(row, nameIndex);
    const email = normalizeLookup(valueAt(row, emailIndex));
    if (!name && !email) return;
    const student = {
      name,
      email: valueAt(row, emailIndex),
      class: valueAt(row, gradeIndex),
      branch: isValidBranch(valueAt(row, branchIndex)) ? valueAt(row, branchIndex) : "",
      paidDate: valueAt(row, paidDateIndex),
      status: valueAt(row, statusIndex)
    };
    if (email) lookup.set(`email:${email}`, student);
    const serial = normalizeLookup(valueAt(row, serialIndex));
    if (serial) lookup.set(`serial:${serial}`, student);
    if (name) lookup.set(`name:${normalizeLookup(name)}`, student);
  });
  return lookup;
}

function findDrillHeaderRow(rows) {
  const exactIndex = rows.slice(0, 12).findIndex((row) => {
    const labels = row.map((cell) => String(cell || "").trim().toLowerCase());
    return labels.includes("submit time") && labels.includes("email") && labels.includes("subject") && labels.includes("topic");
  });
  if (exactIndex >= 0) return exactIndex;
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

function buildDrillData(rows, studentLookup = new Map()) {
  const headerRowIndex = findDrillHeaderRow(rows);
  const header = (rows[headerRowIndex] || rows[0] || []).map((cell) => String(cell || "").trim().toLowerCase());
  const indexOf = (patterns) => header.findIndex((label) => patterns.some((pattern) => label.includes(pattern)));
  const subjectIndex = 10;
  const topicIndex = 11;
  const detectedNameIndex = indexOf(["nama siswa", "student name", "name"]);
  const nameIndex = detectedNameIndex >= 0 && detectedNameIndex !== 0 ? detectedNameIndex : -1;
  const userIndex = indexOf(["user"]);
  const emailIndex = indexOf(["email"]);
  const classIndex = 6;
  const branchIndex = 7;
  const detectedDateIndex = indexOf(["tanggal", "date", "tgl", "waktu"]);
  const dateIndex = detectedDateIndex >= 0 && detectedDateIndex !== 0 ? detectedDateIndex : 16;
  const monthIndex = 17;
  const weekIndex = 19;
  const correctIndex = 12;
  const wrongIndex = 13;
  const blankIndex = 14;
  const totalIndex = indexOf(["total", "jumlah"]);
  return rows.slice(headerRowIndex + 1).map((row) => {
    const matchedStudent = studentFromLookup(row, { emailIndex, nameIndex, userIndex }, studentLookup);
    const student = matchedStudent?.name || valueAt(row, nameIndex) || valueAt(row, emailIndex);
    const attendanceStudent = attendanceStudentFromMatchedStudent(matchedStudent);
    const studentClass = attendanceStudent?.class || classFromStudent(student) || normalizeDrillClass(valueAt(row, classIndex)) || matchedStudent?.class;
    const branch = isValidBranch(matchedStudent?.branch) ? matchedStudent.branch : branchFromStudent(student) || valueAt(row, branchIndex);
    const rawDate = valueAt(row, dateIndex) || valueAt(row, 0);
    if (isInvalidSheetValue(student) || isInvalidSheetValue(studentClass) || isHeaderLike(student) || isHeaderLike(studentClass)) return null;
    if (isInvalidSheetValue(rawDate) || !normalizeDrillDate(rawDate).match(/^\d{4}-\d{2}-\d{2}$/)) return null;
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
      branch,
      paidDate: matchedStudent?.paidDate || "",
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
  const studentCsv = await fetchText(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(STUDENT_SHEET)}`);
  const studentLookup = buildStudentLookup(parseCsv(studentCsv));
  const drillSheets = [...new Set(
    [...studentLookup.values()].map((student) => student.branch).filter(isValidBranch).concat(BRANCH_SHEET_FALLBACKS)
  )];
  const sheets = await Promise.all(drillSheets.map(async (sheetName) => {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}&range=${encodeURIComponent("A:V")}`;
    try {
      return buildDrillData(parseCsv(await fetchText(url)), studentLookup);
    } catch (error) {
      console.warn(`Sheet drill "${sheetName}" gagal dimuat: ${error.message || error}`);
      return [];
    }
  }));
  const data = sheets.flat();
  if (data.length < 100) {
    throw new Error(`Drill data looks incomplete: ${data.length} rows`);
  }
  fs.writeFileSync(OUT, `window.DRILL_DATA = ${JSON.stringify(data)};\n`);
  console.log(`Updated drill-data.js: ${data.length} drill rows`);
})();

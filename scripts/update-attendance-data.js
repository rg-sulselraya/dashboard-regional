const fs = require("fs");
const path = require("path");
const https = require("https");

const SHEET_ID = "1Ay9OPNDLYI0SKsZ4_98y2mqR_y3mVWOwBRhpN8hADJU";
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=0`;
const STUDENT_CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent("Data Siswa")}`;
const OUT = path.join(__dirname, "..", "attendance-data.js");

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

function toNumber(value) {
  const number = Number(String(value || "").trim().replace(",", "."));
  return Number.isFinite(number) ? number : 0;
}

function statusKind(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const lower = text.toLowerCase().replace(/[^a-z]/g, "");
  if (["izin", "ijin", "ij", "i"].includes(lower)) return "Izin";
  if (["sakit", "skit", "skt", "s"].includes(lower)) return "Sakit";
  if (["alpa", "alpha", "a"].includes(lower)) return "Alpa";
  if (text.match(/^-?\d+([,.]\d+)?$/)) {
    return toNumber(text) > 0 ? "Hadir" : "Alpa";
  }
  return text;
}

function weekNumber(week) {
  const match = String(week || "").match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function monthOrder(month) {
  return { July: 7, Juli: 7, Agustus: 8, September: 9, Oktober: 10, November: 11, Desember: 12 }[month] || 99;
}

function comparePeriod(a, b) {
  const aOrder = Number.isFinite(a.order) ? a.order : monthOrder(a.month) * 10 + weekNumber(a.week);
  const bOrder = Number.isFinite(b.order) ? b.order : monthOrder(b.month) * 10 + weekNumber(b.week);
  return aOrder - bOrder || String(a.start || "").localeCompare(String(b.start || ""));
}

function normalizeStudentStatus(row) {
  const statusCell = row.find((cell, index) => index > 4 && ["active", "aktif", "inactive", "non active", "nonaktif"].includes(String(cell || "").trim().toLowerCase()));
  return String(statusCell || "active").trim();
}

function normalizeLookup(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function buildBranchLookup(rows) {
  const header = rows[0] || [];
  const indexOf = (patterns) => header.findIndex((cell) => {
    const label = normalizeLookup(cell);
    return patterns.some((pattern) => label.includes(pattern));
  });
  const emailIndex = indexOf(["email"]);
  const nameIndex = indexOf(["nama siswa", "student"]);
  const serialIndex = indexOf(["user serial", "serial", "user"]);
  const branchIndex = indexOf(["cabang"]);
  const statusIndex = indexOf(["status"]);
  const lookup = new Map();
  lookup.branchTotals = {};
  if (branchIndex < 0) return lookup;
  rows.slice(1).forEach((row) => {
    const branch = String(row[branchIndex] || "").trim();
    if (!branch) return;
    if (/isi nama siswa|tanggal paid/i.test(branch)) return;
    const isActive = String(row[statusIndex] || "").trim().toLowerCase() === "active";
    if (isActive) lookup.branchTotals[branch] = (lookup.branchTotals[branch] || 0) + 1;
    const email = normalizeLookup(row[emailIndex]);
    const name = normalizeLookup(row[nameIndex]);
    const serial = normalizeLookup(row[serialIndex]);
    const setBranch = (key) => {
      if (!key) return;
      const current = lookup.get(key);
      if (!current || isActive) lookup.set(key, { branch, isActive });
    };
    setBranch(email ? `email:${email}` : "");
    setBranch(name ? `name:${name}` : "");
    setBranch(serial ? `serial:${serial}` : "");
  });
  return lookup;
}

function branchForStudent(row, branchLookup) {
  const email = normalizeLookup(row[1]);
  const name = normalizeLookup(row[0]);
  const serial = normalizeLookup(row[5]);
  const branch = branchLookup.get(`email:${email}`)?.branch || branchLookup.get(`name:${name}`)?.branch || branchLookup.get(`serial:${serial}`)?.branch || "";
  return /isi nama siswa|tanggal paid/i.test(branch) ? "" : branch;
}

function buildAttendanceData(rows, branchLookup = new Map()) {
  const header = rows[0] || [];
  const dayrow = rows[1] || [];
  const monthMap = { Jan: "01", Feb: "02", Mar: "03", Apr: "04", Mei: "05", Jun: "06", Jul: "07", Agu: "08", Sep: "09", Okt: "10", Nov: "11", Des: "12" };
  const blocks = [];
  header.forEach((cell, index) => {
    if (String(cell).trim() !== "Month" || String(header[index + 2] || "").trim() !== "Jumlah Sesi Ideal") return;
    const dateColumns = [];
    for (let column = index + 3; column < Math.min(index + 9, header.length); column += 1) {
      const match = String(header[column] || "").trim().match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
      if (!match) continue;
      dateColumns.push({ index: column, label: header[column].trim(), iso: `${match[3]}-${monthMap[match[2]]}-${String(Number(match[1])).padStart(2, "0")}`, day: String(dayrow[column] || "").trim() });
    }
    if (!dateColumns.length) return;
    const votes = new Map();
    rows.slice(2).forEach((row) => {
      const month = String(row[index] || "").trim();
      const week = String(row[index + 1] || "").trim();
      if (!month || !week) return;
      const key = `${month}|${week}`;
      votes.set(key, (votes.get(key) || 0) + 1);
    });
    const best = [...votes.entries()].sort((a, b) => b[1] - a[1])[0];
    if (!best) return;
    const [month, week] = best[0].split("|");
    blocks.push({ monthIndex: index, weekIndex: index + 1, idealIndex: index + 2, month, week, order: blocks.length, dateColumns });
  });

  const students = [];
  const records = [];
  const studentWeeks = [];
  const weekMap = new Map();
  rows.slice(2).forEach((row, rowIndex) => {
    if (!String(row[0] || "").trim()) return;
    const studentId = rowIndex + 1;
      const student = {
        id: studentId,
        name: String(row[0] || "").trim(),
        email: String(row[1] || "").trim(),
        class: String(row[2] || "").trim(),
        branch: branchForStudent(row, branchLookup),
        paidDate: String(row[3] || "").trim(),
        studyDays: String(row[4] || "").trim(),
        status: normalizeStudentStatus(row)
      };
    students.push(student);
    blocks.forEach((block) => {
      const month = block.month;
      const week = block.week;
      const idealSessions = toNumber(row[block.idealIndex]);
      const weekKey = `${month}|${week}|${block.dateColumns[0].iso}`;
      weekMap.set(weekKey, { key: weekKey, month, week, start: block.dateColumns[0].iso, end: block.dateColumns[block.dateColumns.length - 1].iso, label: `${month} - ${week}`, order: block.order, weekOrder: weekNumber(week) });
      studentWeeks.push({ studentId, student: student.name, class: student.class, branch: student.branch, month, week, weekKey, weekStart: block.dateColumns[0].iso, weekEnd: block.dateColumns[block.dateColumns.length - 1].iso, idealSessions, periodOrder: block.order });
      block.dateColumns.forEach((column) => {
        const raw = String(row[column.index] ?? "").trim();
        const status = statusKind(raw);
        if (!status) return;
        records.push({ studentId, student: student.name, class: student.class, branch: student.branch, date: column.iso, dateLabel: column.label, day: column.day, raw, status, sessions: toNumber(raw), month, week, weekKey, weekStart: block.dateColumns[0].iso, weekEnd: block.dateColumns[block.dateColumns.length - 1].iso, idealSessions, periodOrder: block.order });
      });
    });
  });
  const weeks = [...weekMap.values()].sort(comparePeriod);
  return { generatedFrom: `Google Sheets ${new Date().toISOString()}`, studentCount: students.length, weekCount: weeks.length, branchTotals: branchLookup.branchTotals || {}, students, weeks, studentWeeks, records };
}

(async () => {
  const csv = await fetchText(CSV_URL);
  const studentCsv = await fetchText(STUDENT_CSV_URL);
  const data = buildAttendanceData(parseCsv(csv), buildBranchLookup(parseCsv(studentCsv)));
  if (data.weeks.length < 20 || data.records.length < 1000) {
    throw new Error(`Data looks incomplete: ${data.weeks.length} weeks, ${data.records.length} records`);
  }
  fs.writeFileSync(OUT, `window.ATTENDANCE_DATA = ${JSON.stringify(data)};\n`);
  console.log(`Updated attendance-data.js: ${data.students.length} students, ${data.weeks.length} weeks, ${data.records.length} records`);
})();

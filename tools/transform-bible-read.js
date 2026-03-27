const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

const sourcePath = path.resolve(
  "d:/03.woojjajja/03.service/web+server/jejaban.netlify.app/data/제자반_42주_성경읽기안내.xlsx"
);
const targetPath = path.resolve(
  "d:/03.woojjajja/03.service/web+server/jejaban.netlify.app/bible-read/data.json"
);

const decodeXml = (value) =>
  String(value || "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");

const parseRows = (xml) => {
  const rows = [];
  for (const match of xml.matchAll(/<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const rowNum = Number(match[1]);
    const body = match[2];
    const cells = {};

    for (const cell of body.matchAll(/<c[^>]*r="([A-Z]+)\d+"[^>]*>([\s\S]*?)<\/c>/g)) {
      const col = cell[1];
      const textMatch = cell[2].match(/<t>([\s\S]*?)<\/t>/);
      cells[col] = decodeXml(textMatch ? textMatch[1] : "")
        .replace(/\r/g, "")
        .trim();
    }

    rows.push({ rowNum, cells });
  }
  return rows;
};

const cleanLine = (value) =>
  String(value || "")
    .replace(/^\s*\d+\s*:\s*/u, "")
    .replace(/\s+/g, " ")
    .trim();

const ONE_CHAPTER_BOOKS = new Set(["옵", "몬", "유", "요이", "요삼"]);

const normalizeReadingLine = (line, lastBookRef) => {
  const normalized = cleanLine(line);
  if (!normalized) return null;

  if (ONE_CHAPTER_BOOKS.has(normalized)) {
    return {
      reading: normalized,
      lastBook: normalized,
    };
  }

  const match = normalized.match(/^([가-힣]{1,4})\s*(.+)$/u);
  if (match) {
    return {
      reading: `${match[1]}${match[2].replace(/\s+/g, "")}`,
      lastBook: match[1],
    };
  }

  if (!lastBookRef.current) {
    throw new Error(`책 이름 없이 시작한 분량을 해석할 수 없습니다: ${normalized}`);
  }

  return {
    reading: `${lastBookRef.current}${normalized.replace(/\s+/g, "")}`,
    lastBook: lastBookRef.current,
  };
};

const buildPlan = (rows) => {
  const weeks = [];
  let entry = 1;
  const lastBookRef = { current: "" };

  for (const row of rows) {
    if (row.rowNum < 3 || row.rowNum > 44) continue;

    const week = Number((row.cells.A || "").replace(/[^\d]/g, ""));
    if (!week) continue;

    const days = [];
    const dayColumns = ["D", "E", "F", "G", "H", "I", "J"];

    dayColumns.forEach((col, index) => {
      const raw = row.cells[col] || "";
      const parts = raw
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean);

      const readings = parts.map((part) => {
        const parsed = normalizeReadingLine(part, lastBookRef);
        lastBookRef.current = parsed.lastBook;
        return parsed.reading;
      });

      days.push({
        day: index + 1,
        entry,
        readings,
      });

      entry += 1;
    });

    weeks.push({ week, days });
  }

  return {
    planName: "42주 성경 1독",
    totalWeeks: 42,
    daysPerWeek: 7,
    weeks,
  };
};

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "jejaban-bible-read-"));

try {
  execFileSync("tar", ["-xf", sourcePath, "-C", tempDir], { stdio: "ignore" });

  const worksheetXml = fs.readFileSync(
    path.join(tempDir, "xl", "worksheets", "sheet1.xml"),
    "utf8"
  );
  const rows = parseRows(worksheetXml);
  const output = buildPlan(rows);

  fs.writeFileSync(targetPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(`Wrote ${targetPath}`);
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

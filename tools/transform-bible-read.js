const fs = require("fs");
const path = require("path");

const sourcePath = path.resolve(
  "d:/03.woojjajja/03.service/web+server/nalmada.netlify.app/bible-read/data.json"
);
const targetPath = path.resolve(
  "d:/03.woojjajja/03.service/web+server/jejaban.netlify.app/bible-read/data.json"
);

const src = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
const weeks = [];

for (let week = 1; week <= 42; week += 1) {
  const days = [];
  for (let day = 1; day <= 7; day += 1) {
    const index = (week - 1) * 7 + (day - 1);
    const row = src[index] || {};
    days.push({
      day,
      entry: index + 1,
      readings: Array.isArray(row.readings) ? row.readings : [],
    });
  }
  weeks.push({ week, days });
}

const output = {
  planName: "42주 성경 1독",
  totalWeeks: 42,
  daysPerWeek: 7,
  weeks,
};

fs.writeFileSync(targetPath, JSON.stringify(output, null, 2));
console.log(`Wrote ${targetPath}`);

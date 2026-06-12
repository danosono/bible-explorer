// One-off verification script (not part of the runtime app) for the
// enforceAspectRatios rewrite. Runs the same algorithm as js/app.js against
// real character-count data and prints column packing + floor stats.
const fs = require('fs');
const path = require('path');

const BOOK_ORDER = [
  "GEN","EXO","LEV","NUM","DEU","JOS","JDG","RUT","1SA","2SA","1KI","2KI","1CH","2CH",
  "EZR","NEH","EST","JOB","PSA","PRO","ECC","SNG","ISA","JER","LAM","EZK","DAN","HOS",
  "JOL","AMO","OBA","JON","MIC","NAM","HAB","ZEP","HAG","ZEC","MAL","MAT","MRK","LUK",
  "JHN","ACT","ROM","1CO","2CO","GAL","EPH","PHP","COL","1TH","2TH","1TI","2TI","TIT",
  "PHM","HEB","JAS","1PE","2PE","1JN","2JN","3JN","JUD","REV"
];

const counts = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'data', 'book-character-counts.json'), 'utf-8')
).books;

const items = BOOK_ORDER.map((id) => ({ id, value: Math.max(1, Number(counts[id]) || 1) }));
const malIndex = items.findIndex((i) => i.id === 'MAL');
items.splice(malIndex + 1, 0, { id: 'SEPARATOR', value: 100 });

const enforceAspectRatios = (items, width, height) => {
  const cols = 14;
  const colWidth = width / cols;
  const minHeight = 110;

  items.forEach((item) => {
    item.sizeWeight = Math.pow(item.value, 0.3);
  });

  const packColumns = (unitHeight) => {
    const columns = Array.from({ length: cols }, () => []);
    let col = 0;
    let colHeight = 0;
    items.forEach((item) => {
      const itemHeight = Math.max(minHeight, item.sizeWeight * unitHeight);
      if (colHeight > 0 && colHeight + itemHeight > height && col < cols - 1) {
        col += 1;
        colHeight = 0;
      }
      columns[col].push(item);
      colHeight += itemHeight;
    });
    return columns;
  };

  const minWeight = Math.min(...items.map((item) => item.sizeWeight));
  let lo = 0;
  let hi = height / minWeight;
  for (let i = 0; i < 25; i += 1) {
    const mid = (lo + hi) / 2;
    const usedCols = packColumns(mid).filter((col) => col.length > 0).length;
    if (usedCols >= cols) {
      hi = mid;
    } else {
      lo = mid;
    }
  }
  const columnItems = packColumns(hi);

  let maxColumnHeight = 0;
  columnItems.forEach((column) => {
    if (!column.length) return;
    const totalHeight = column.reduce(
      (sum, item) => sum + Math.max(minHeight, item.sizeWeight * hi),
      0
    );
    maxColumnHeight = Math.max(maxColumnHeight, totalHeight);
  });
  const scaleFactor = maxColumnHeight > height ? height / maxColumnHeight : 1;

  columnItems.forEach((column, colIndex) => {
    if (!column.length) return;
    const x = colIndex * colWidth;

    const baseHeights = column.map(
      (item) => Math.max(minHeight, item.sizeWeight * hi) * scaleFactor
    );
    const columnSum = baseHeights.reduce((sum, h) => sum + h, 0);
    const fillFactor = columnSum < height ? height / columnSum : 1;

    let y = 0;
    column.forEach((item, i) => {
      const itemHeight = baseHeights[i] * fillFactor;
      item.w = colWidth;
      item.h = itemHeight;
      item.x = x;
      item.y = y;
      item.colIndex = colIndex;
      y += itemHeight;
    });
  });

  return { columnItems, unitHeight: hi, scaleFactor };
};

const run = (label, width, height) => {
  // Deep copy items (algorithm mutates)
  const copy = items.map((i) => ({ ...i }));
  const { columnItems, unitHeight, scaleFactor } = enforceAspectRatios(copy, width, height);

  console.log(`\n=== ${label} (width=${width}, height=${height}) ===`);
  console.log(`unitHeight=${unitHeight.toFixed(6)} scaleFactor=${scaleFactor.toFixed(4)}`);

  let floorCount = 0;
  let total = 0;
  columnItems.forEach((col, i) => {
    const ids = col.map((it) => `${it.id}(${it.h.toFixed(0)})`).join(', ');
    col.forEach((it) => {
      total += 1;
      if (Math.abs(it.h - 110) < 0.01) floorCount += 1;
    });
    const sum = col.reduce((s, it) => s + it.h, 0);
    console.log(`Col ${i} (${col.length} items, sum=${sum.toFixed(1)}, fill=${(sum / height * 100).toFixed(1)}%): ${ids}`);
  });
  console.log(`Floor (110px) items: ${floorCount}/${total}`);

  const ksaIdx = copy.findIndex((it) => it.id === '1KI');
  const samIdx = copy.findIndex((it) => it.id === '2SA');
  console.log(`2SA -> col ${copy[samIdx].colIndex}, h=${copy[samIdx].h.toFixed(1)}`);
  console.log(`1KI -> col ${copy[ksaIdx].colIndex}, h=${copy[ksaIdx].h.toFixed(1)}`);
};

// Representative HD/4K treemap dimensions (from prior session's hand analysis)
run('HD', 1800, 831.8);
run('4K', 2400, 1330);

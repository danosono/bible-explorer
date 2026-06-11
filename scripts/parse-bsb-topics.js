const fs = require('fs').promises;
const path = require('path');
const XLSX = require('xlsx');
const { BOOK_IDS, loadBibleData, getAbsoluteVerseIndex } = require('./lib/bsb-shared');

const INPUT_PATH = 'C:/Unity Projects/_BibleDatasets/Berean/bsb_topical_index.xlsx';

const unknownBookCounts = new Map();

// "Revelation 13:16–18" / "1 John 2:16, 17" / "Psalm 119:9, 11–12" -> { bookId, bookLabel, chapter, verses: [...] }
function parseVerseReference(ref) {
  const match = String(ref).trim().match(/^(.+?)\s+(\d+):(.+)$/);
  if (!match) return null;

  const bookLabel = match[1].trim();
  const chapter = parseInt(match[2], 10);
  const verseStr = match[3];

  const bookId = BOOK_IDS[bookLabel];
  if (!bookId) {
    unknownBookCounts.set(bookLabel, (unknownBookCounts.get(bookLabel) || 0) + 1);
    return null;
  }

  const verses = [];
  const parts = verseStr.split(',').map((p) => p.trim());
  for (const part of parts) {
    if (part.includes('–') || part.includes('-')) {
      const [start, end] = part.split(/–|-/).map((v) => parseInt(v.trim(), 10));
      for (let v = start; v <= end; v += 1) {
        verses.push(v);
      }
    } else {
      verses.push(parseInt(part, 10));
    }
  }

  return {
    bookId,
    bookLabel,
    chapter,
    verses: Array.from(new Set(verses)).sort((a, b) => a - b)
  };
}

async function parseTopics(bibleData) {
  const wb = XLSX.readFile(INPUT_PATH);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });

  // Skip the two title/header rows
  const data = rows.slice(3);

  const result = {};
  let currentTopicName = null;
  let currentSubtopic = null;
  let skippedRefs = 0;

  for (const row of data) {
    const source = row[1];
    const topic = row[2];
    const verse = row[4];

    if (source === 'Top') {
      currentTopicName = String(topic).trim();
      currentSubtopic = null;
      if (currentTopicName && !result[currentTopicName]) {
        result[currentTopicName] = { name: currentTopicName, references: {}, books: [] };
      }
      continue;
    }

    if (source === 'Nav' || source === 'TTT') {
      currentSubtopic = String(topic).trim();
      continue;
    }

    if (source === '' && verse && currentTopicName) {
      const parsed = parseVerseReference(verse);
      if (!parsed) {
        skippedRefs += 1;
        continue;
      }

      const topicData = result[currentTopicName];
      if (!topicData.references[parsed.bookId]) {
        topicData.references[parsed.bookId] = [];
      }

      for (const verseNumber of parsed.verses) {
        const absoluteVerse = getAbsoluteVerseIndex(bibleData, parsed.bookId, parsed.chapter, verseNumber);
        topicData.references[parsed.bookId].push({
          verse: absoluteVerse || verseNumber,
          subtopics: currentSubtopic ? [currentSubtopic] : [],
          refs: [`${parsed.bookLabel} ${parsed.chapter}:${verseNumber}`]
        });
      }
    }
  }

  for (const topicData of Object.values(result)) {
    const bookIds = [];
    for (const [bookId, refs] of Object.entries(topicData.references)) {
      refs.sort((a, b) => a.verse - b.verse);
      bookIds.push(bookId);
    }
    topicData.books = bookIds;
  }

  console.log(`Skipped ${skippedRefs} unparseable verse references.`);
  return result;
}

async function main() {
  console.log('Loading bible.json for exact verse positions...');
  const bibleData = await loadBibleData();

  console.log('Parsing BSB Topical Index...');
  const topics = await parseTopics(bibleData);

  const outputPath = path.join(__dirname, '..', 'data', 'bsb-topics-with-references.json');
  // Written minified (no pretty-printing) - this dataset is ~2.5x larger than
  // Nave's Topics and is eager-loaded by the browser, so size matters.
  await fs.writeFile(outputPath, JSON.stringify(topics));

  const topicCount = Object.keys(topics).length;
  const totalRefs = Object.values(topics)
    .reduce((sum, t) => sum + Object.values(t.references).flat().length, 0);
  console.log(`Wrote ${outputPath}`);
  console.log(`Parsed ${topicCount} topics with ${totalRefs} total verse references.`);

  if (unknownBookCounts.size) {
    console.log('\nUnknown book labels (count):');
    const sorted = Array.from(unknownBookCounts.entries()).sort((a, b) => b[1] - a[1]);
    for (const [label, count] of sorted) {
      console.log(`  ${label}: ${count}`);
    }
  } else {
    console.log('No unknown book labels found.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

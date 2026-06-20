const fs = require('fs').promises;
const path = require('path');
const { BOOK_IDS } = require('./lib/naves-book-ids');

// Book verse counts (from your BSB data)
const BOOK_VERSE_COUNTS = {
  GEN: 1533, EXO: 1213, LEV: 859, NUM: 1288, DEU: 959,
  JOS: 658, JDG: 618, RUT: 85, "1SA": 822, "2SA": 695,
  "1KI": 816, "2KI": 719, "1CH": 942, "2CH": 936, EZR: 280,
  NEH: 406, EST: 210, JOB: 1070, PSA: 2461, PRO: 915,
  ECC: 222, SNG: 117, ISA: 1292, JER: 1364, LAM: 154,
  EZK: 1273, DAN: 357, HOS: 197, JOL: 73, AMO: 146,
  OBA: 21, JON: 48, MIC: 105, NAM: 47, HAB: 56,
  ZEP: 53, HAG: 38, ZEC: 211, MAL: 55,
  MAT: 1071, MRK: 678, LUK: 1151, JHN: 879, ACT: 1007,
  ROM: 433, "1CO": 437, "2CO": 257, GAL: 149, EPH: 155,
  PHP: 104, COL: 95, "1TH": 89, "2TH": 47, "1TI": 113,
  "2TI": 83, TIT: 46, PHM: 25, HEB: 303, JAS: 108,
  "1PE": 105, "2PE": 61, "1JN": 105, "2JN": 13, "3JN": 14,
  JUD: 25, REV: 404
};

const unknownBookCounts = new Map();

// Nave's (at least this digitized source) cites these one-chapter books by
// chapter number alone - e.g. "Jude 1", "Phm 1" - instead of "Jude 1:1". The
// bare number is the verse, with chapter always implicitly 1.
const SINGLE_CHAPTER_BOOK_IDS = new Set(['OBA', 'PHM', '2JN', '3JN', 'JUD']);

function parseVerseReference(ref) {
  // Parses "Gen. 3:15" or "Matt. 1:18, 23" or "Luke 1:26–35, 38–56"
  // Returns { bookId, verses: [15] } or { bookId, verses: [18, 23] } or { bookId, verses: [26-35, 38-56] }

  const trimmed = ref.trim();
  let bookNameRaw;
  let chapter;
  let verseStr;

  const colonMatch = trimmed.match(/^([1-3]?\s?[A-Za-z\s\.]+?)\s+(\d+):(.+)$/);
  if (colonMatch) {
    bookNameRaw = colonMatch[1];
    chapter = parseInt(colonMatch[2]);
    verseStr = colonMatch[3];
  } else {
    // No "chapter:verse" colon - only safe to resolve for one-chapter books
    // (see SINGLE_CHAPTER_BOOK_IDS below); bail out for everything else.
    const bareMatch = trimmed.match(/^([1-3]?\s?[A-Za-z\s\.]+?)\s+(\d[\d\-,]*)$/);
    if (!bareMatch) return null;
    bookNameRaw = bareMatch[1];
    chapter = null;
    verseStr = bareMatch[2];
  }

  const bookName = bookNameRaw.trim();
  const bookLabel = bookName.replace(/\.$/, "");
  const bookKey = bookLabel;

  // Find book ID
  let bookId = BOOK_IDS[bookKey];
  if (!bookId) {
    // Try partial matching
    const keys = Object.keys(BOOK_IDS);
    const found = keys.find(k => bookKey.includes(k) || k.includes(bookKey));
    if (found) bookId = BOOK_IDS[found];
  }

  if (!bookId) {
    const key = bookKey || bookName || 'UNKNOWN';
    unknownBookCounts.set(key, (unknownBookCounts.get(key) || 0) + 1);
    return null;
  }

  if (chapter === null) {
    if (!SINGLE_CHAPTER_BOOK_IDS.has(bookId)) return null;
    chapter = 1;
  }

  // Parse verse numbers
  const verses = [];
  const parts = verseStr.split(',').map(p => p.trim());
  
  for (const part of parts) {
    if (part.includes('–') || part.includes('-')) {
      // Range like "26–35"
      const [start, end] = part.split(/–|-/).map(v => parseInt(v.trim()));
      for (let v = start; v <= end; v++) {
        verses.push(v);
      }
    } else {
      verses.push(parseInt(part));
    }
  }
  
  return {
    bookId,
    bookLabel,
    chapter,
    verses: Array.from(new Set(verses)).sort((a, b) => a - b)
  };
}

function calculateVersePosition(bookId, chapter, verse) {
  // Calculate absolute verse position in book
  // This is simplified; assumes verses are sequential by chapter
  const totalVersesInBook = BOOK_VERSE_COUNTS[bookId] || 1000;
  
  // Rough calculation: position = (chapter - 1) * avg_verses_per_chapter + verse
  // For more accuracy, we'd need chapter breakdowns
  const avgVersesPerChapter = totalVersesInBook / 150; // rough avg ~130 chapters
  const position = Math.min(
    totalVersesInBook,
    Math.max(1, Math.round((chapter - 1) * avgVersesPerChapter + verse))
  );
  
  return position;
}

const splitTopicName = (name) => {
  const parts = String(name || "").split(" - ");
  const main = parts[0]?.trim() || "";
  const subtopic = parts.slice(1).join(" - ").trim();
  return { main, subtopic: subtopic || null };
};

async function parseTopics() {
  const inputPath = path.join(__dirname, '..', 'data', 'topics-input.json');
  
  let inputData;
  try {
    const content = await fs.readFile(inputPath, 'utf-8');
    inputData = JSON.parse(content);
  } catch (error) {
    console.error(`Error reading ${inputPath}:`, error.message);
    process.exit(1);
  }
  
  if (!inputData.topics || !Array.isArray(inputData.topics)) {
    console.error('Invalid format: topics-input.json must have a "topics" array');
    process.exit(1);
  }
  
  const result = {};
  
  for (const topic of inputData.topics) {
    const topicName = topic.name;
    const refString = topic.verses;
    
    if (!topicName || !refString) {
      console.warn('Skipping topic with missing name or verses');
      continue;
    }
    
    const refs = refString.split(';').map(r => r.trim()).filter(r => r);
    const { main, subtopic } = splitTopicName(topicName);
    const label = subtopic || main;

    if (!main) {
      console.warn('Skipping topic with empty name');
      continue;
    }

    if (!result[main]) {
      result[main] = {
        name: main,
        references: {},
        books: []
      };
    }

    const topicData = result[main];
    
    for (const ref of refs) {
      const parsed = parseVerseReference(ref);
      if (!parsed) continue;
      
      if (!topicData.references[parsed.bookId]) {
        topicData.references[parsed.bookId] = new Map();
      }

      const bookMap = topicData.references[parsed.bookId];
      for (const verse of parsed.verses) {
        const position = calculateVersePosition(parsed.bookId, parsed.chapter, verse);
        const existing = bookMap.get(position) || { verse: position, subtopics: new Set(), refs: new Set() };
        existing.refs.add(`${parsed.bookLabel} ${parsed.chapter}:${verse}`);
        existing.subtopics.add(label);
        bookMap.set(position, existing);
      }
    }
  }

  for (const topicData of Object.values(result)) {
    const bookIds = [];
    for (const [bookId, verseMap] of Object.entries(topicData.references)) {
      const verseList = Array.from(verseMap.values())
        .map((entry) => ({
          verse: entry.verse,
          subtopics: Array.from(entry.subtopics),
          refs: Array.from(entry.refs)
        }))
        .sort((a, b) => a.verse - b.verse);
      topicData.references[bookId] = verseList;
      bookIds.push(bookId);
    }
    topicData.books = bookIds;
  }
  
  return result;
}

async function main() {
  try {
    console.log('Parsing topics...');
    const topics = await parseTopics();
    
    const outputPath = path.join(__dirname, '..', 'data', 'topics-with-references.json');
    await fs.writeFile(outputPath, JSON.stringify(topics, null, 2));
    
    console.log(`✓ Topics data written to ${outputPath}`);
    console.log(`\nParsed ${Object.keys(topics).length} topic(s)`);
    
    for (const [name, data] of Object.entries(topics)) {
      console.log(`  "${name}": ${data.books.length} books with ${Object.values(data.references).flat().length} total verse references`);
    }

    if (unknownBookCounts.size) {
      console.log('\nUnknown book labels (count):');
      const sorted = Array.from(unknownBookCounts.entries())
        .sort((a, b) => b[1] - a[1]);
      for (const [label, count] of sorted) {
        console.log(`  ${label}: ${count}`);
      }
    } else {
      console.log('\nNo unknown book labels found.');
    }
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();

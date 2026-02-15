const fs = require('fs').promises;
const path = require('path');

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

// Book ID to abbreviation mapping
const BOOK_IDS = {
  'Gen': 'GEN', 'Exodus': 'EXO', 'Exod': 'EXO', 'Leviticus': 'LEV', 'Lev': 'LEV',
  'Numbers': 'NUM', 'Num': 'NUM', 'Deuteronomy': 'DEU', 'Deut': 'DEU',
  'Joshua': 'JOS', 'Josh': 'JOS', 'Judges': 'JDG', 'Ruth': 'RUT',
  '1 Samuel': '1SA', '1SA': '1SA', '1 Sam': '1SA',
  '2 Samuel': '2SA', '2SA': '2SA', '2 Sam': '2SA',
  '1 Kings': '1KI', '1Kgs': '1KI', '1 Kgs': '1KI',
  '2 Kings': '2KI', '2Kgs': '2KI', '2 Kgs': '2KI',
  '1 Chronicles': '1CH', '1Chr': '1CH', '1 Chr': '1CH',
  '2 Chronicles': '2CH', '2Chr': '2CH', '2 Chr': '2CH',
  'Ezra': 'EZR', 'Nehemiah': 'NEH', 'Neh': 'NEH',
  'Esther': 'EST', 'Job': 'JOB', 'Psalms': 'PSA', 'Psa': 'PSA',
  'Proverbs': 'PRO', 'Pro': 'PRO', 'Ecclesiastes': 'ECC', 'Eccl': 'ECC',
  'Song of Songs': 'SNG', 'Song': 'SNG', 'Isaiah': 'ISA', 'Isa': 'ISA',
  'Jeremiah': 'JER', 'Jer': 'JER', 'Lamentations': 'LAM', 'Lam': 'LAM',
  'Ezekiel': 'EZK', 'Ezek': 'EZK', 'Daniel': 'DAN', 'Dan': 'DAN',
  'Hosea': 'HOS', 'Hos': 'HOS', 'Joel': 'JOL', 'Amos': 'AMO',
  'Obadiah': 'OBA', 'Oba': 'OBA', 'Jonah': 'JON', 'Micah': 'MIC', 'Mic': 'MIC',
  'Nahum': 'NAM', 'Nahm': 'NAM', 'Habakkuk': 'HAB', 'Hab': 'HAB',
  'Zephaniah': 'ZEP', 'Zeph': 'ZEP', 'Haggai': 'HAG', 'Hag': 'HAG',
  'Zechariah': 'ZEC', 'Zech': 'ZEC', 'Malachi': 'MAL', 'Mal': 'MAL',
  'Matthew': 'MAT', 'Matt': 'MAT', 'Mark': 'MRK',
  'Luke': 'LUK', 'John': 'JHN', 'Acts': 'ACT',
  'Romans': 'ROM', 'Rom': 'ROM', '1 Corinthians': '1CO', '1Cor': '1CO', '1 Cor': '1CO',
  '2 Corinthians': '2CO', '2Cor': '2CO', '2 Cor': '2CO',
  'Galatians': 'GAL', 'Gal': 'GAL', 'Ephesians': 'EPH', 'Eph': 'EPH',
  'Philippians': 'PHP', 'Phil': 'PHP', 'Colossians': 'COL', 'Col': 'COL',
  '1 Thessalonians': '1TH', '1Thess': '1TH', '1 Thess': '1TH',
  '2 Thessalonians': '2TH', '2Thess': '2TH', '2 Thess': '2TH',
  '1 Timothy': '1TI', '1Tim': '1TI', '1 Tim': '1TI',
  '2 Timothy': '2TI', '2Tim': '2TI', '2 Tim': '2TI',
  'Titus': 'TIT', 'Philemon': 'PHM', 'Hebrews': 'HEB', 'Heb': 'HEB',
  'James': 'JAS', 'Jas': 'JAS', '1 Peter': '1PE', '1Pet': '1PE', '1 Pet': '1PE',
  '2 Peter': '2PE', '2Pet': '2PE', '2 Pet': '2PE',
  '1 John': '1JN', '1Jn': '1JN', '1 Jn': '1JN',
  '2 John': '2JN', '2Jn': '2JN', '2 Jn': '2JN',
  '3 John': '3JN', '3Jn': '3JN', '3 Jn': '3JN',
  'Jude': 'JUD', 'Revelation': 'REV', 'Rev': 'REV'
};

function parseVerseReference(ref) {
  // Parses "Gen. 3:15" or "Matt. 1:18, 23" or "Luke 1:26–35, 38–56"
  // Returns { bookId, verses: [15] } or { bookId, verses: [18, 23] } or { bookId, verses: [26-35, 38-56] }
  
  const match = ref.trim().match(/^([A-Za-z\s\.]+?)\s+(\d+):(.+)$/);
  if (!match) return null;
  
  const bookName = match[1].trim();
  const bookLabel = bookName.replace(/\.$/, "");
  const chapter = parseInt(match[2]);
  const verseStr = match[3];
  
  // Find book ID
  let bookId = BOOK_IDS[bookName];
  if (!bookId) {
    // Try partial matching
    const keys = Object.keys(BOOK_IDS);
    const found = keys.find(k => bookName.includes(k) || k.includes(bookName));
    if (found) bookId = BOOK_IDS[found];
  }
  
  if (!bookId) {
    console.warn(`Could not identify book: ${bookName}`);
    return null;
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
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();

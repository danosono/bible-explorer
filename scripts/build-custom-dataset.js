// Builds data/custom-topics-with-references.json from the hand-maintained
// source/custom-topics.json authoring file. Run this after adding/editing
// entries in source/custom-topics.json:
//
//   node scripts/build-custom-dataset.js
//
// Authoring format (source/custom-topics.json):
//   {
//     "Topic Name": [
//       "Book Ch:V",
//       "Book Ch:V-V2",        // verse range
//       "Book Ch:V | a note"   // optional note, shown as the verse's subtopic text
//     ]
//   }
//
// Output follows the same schema as the other datasets (see
// data/prophecy-topics-with-references.json and docs/treemap-and-datasets.md):
//   { "Topic Name": { name, references: { BOOKID: [{ verse, subtopics, refs }] }, books } }
// where `verse` is the absolute verse index within the book (not chapter:verse).

const fs = require("fs");
const path = require("path");

const SOURCE_PATH = path.join(__dirname, "..", "source", "custom-topics.json");
const OUTPUT_PATH = path.join(__dirname, "..", "data", "custom-topics-with-references.json");
const BIBLE_DATA_PATH = path.join(__dirname, "..", "data", "bible.json");

// Duplicated from scripts/parse-prophecy-docx.js (same convention used across
// every scripts/parse-*.js file — each script is self-contained).
const BOOK_IDS = {
  "Genesis": "GEN", "Gen": "GEN", "Ge": "GEN", "Gn": "GEN",
  "Exodus": "EXO", "Exod": "EXO", "Ex": "EXO",
  "Leviticus": "LEV", "Lev": "LEV", "Le": "LEV",
  "Numbers": "NUM", "Num": "NUM", "Nu": "NUM",
  "Deuteronomy": "DEU", "Deut": "DEU", "De": "DEU", "Dt": "DEU",
  "Joshua": "JOS", "Josh": "JOS", "Jos": "JOS",
  "Judges": "JDG", "Judg": "JDG", "Jdg": "JDG",
  "Ruth": "RUT", "Ru": "RUT",
  "1 Samuel": "1SA", "1Sam": "1SA", "1 Sam": "1SA", "I Samuel": "1SA",
  "2 Samuel": "2SA", "2Sam": "2SA", "2 Sam": "2SA", "II Samuel": "2SA",
  "1 Kings": "1KI", "1Kgs": "1KI", "1 Kgs": "1KI", "1 Ki": "1KI", "I Kings": "1KI",
  "2 Kings": "2KI", "2Kgs": "2KI", "2 Kgs": "2KI", "2 Ki": "2KI", "II Kings": "2KI",
  "1 Chronicles": "1CH", "1Chr": "1CH", "1 Chr": "1CH", "I Chronicles": "1CH",
  "2 Chronicles": "2CH", "2Chr": "2CH", "2 Chr": "2CH", "II Chronicles": "2CH",
  "Ezra": "EZR", "Ezr": "EZR",
  "Nehemiah": "NEH", "Neh": "NEH", "Ne": "NEH",
  "Esther": "EST", "Est": "EST",
  "Job": "JOB",
  "Psalm": "PSA", "Psalms": "PSA", "Ps": "PSA", "Psa": "PSA",
  "Proverbs": "PRO", "Prov": "PRO", "Pro": "PRO", "Pr": "PRO",
  "Ecclesiastes": "ECC", "Eccl": "ECC", "Ec": "ECC",
  "Song of Songs": "SNG", "Song": "SNG", "So": "SNG", "Cant": "SNG",
  "Isaiah": "ISA", "Isa": "ISA",
  "Jeremiah": "JER", "Jer": "JER",
  "Lamentations": "LAM", "Lam": "LAM", "La": "LAM",
  "Ezekiel": "EZK", "Ezek": "EZK", "Eze": "EZK",
  "Daniel": "DAN", "Dan": "DAN", "Da": "DAN",
  "Hosea": "HOS", "Hos": "HOS", "Ho": "HOS",
  "Joel": "JOL", "Joe": "JOL",
  "Amos": "AMO", "Am": "AMO",
  "Obadiah": "OBA", "Oba": "OBA", "Ob": "OBA",
  "Jonah": "JON", "Jon": "JON",
  "Micah": "MIC", "Mic": "MIC",
  "Nahum": "NAM", "Nah": "NAM", "Na": "NAM",
  "Habakkuk": "HAB", "Hab": "HAB",
  "Zephaniah": "ZEP", "Zeph": "ZEP", "Zep": "ZEP",
  "Haggai": "HAG", "Hag": "HAG",
  "Zechariah": "ZEC", "Zech": "ZEC", "Zec": "ZEC",
  "Malachi": "MAL", "Mal": "MAL",
  "Matthew": "MAT", "Matt": "MAT", "Mt": "MAT",
  "Mark": "MRK", "Mrk": "MRK", "Mk": "MRK", "Mr": "MRK",
  "Luke": "LUK", "Luk": "LUK", "Lu": "LUK", "Lk": "LUK",
  "John": "JHN", "Jn": "JHN", "Jno": "JHN", "Joh": "JHN",
  "Acts": "ACT", "Act": "ACT", "Ac": "ACT",
  "Romans": "ROM", "Rom": "ROM", "Ro": "ROM", "Rm": "ROM",
  "1 Corinthians": "1CO", "1Cor": "1CO", "1 Cor": "1CO", "I Corinthians": "1CO",
  "2 Corinthians": "2CO", "2Cor": "2CO", "2 Cor": "2CO", "II Corinthians": "2CO",
  "Galatians": "GAL", "Gal": "GAL", "Ga": "GAL",
  "Ephesians": "EPH", "Eph": "EPH", "Ep": "EPH",
  "Philippians": "PHP", "Phil": "PHP", "Php": "PHP",
  "Colossians": "COL", "Col": "COL",
  "1 Thessalonians": "1TH", "1Thess": "1TH", "1 Thess": "1TH", "I Thessalonians": "1TH",
  "2 Thessalonians": "2TH", "2Thess": "2TH", "2 Thess": "2TH", "II Thessalonians": "2TH",
  "1 Timothy": "1TI", "1Tim": "1TI", "1 Tim": "1TI", "I Timothy": "1TI",
  "2 Timothy": "2TI", "2Tim": "2TI", "2 Tim": "2TI", "II Timothy": "2TI",
  "Titus": "TIT", "Tit": "TIT",
  "Philemon": "PHM", "Phm": "PHM",
  "Hebrews": "HEB", "Heb": "HEB",
  "James": "JAS", "Jas": "JAS", "Jm": "JAS",
  "1 Peter": "1PE", "1Pet": "1PE", "1 Pet": "1PE", "I Peter": "1PE",
  "2 Peter": "2PE", "2Pet": "2PE", "2 Pet": "2PE", "II Peter": "2PE",
  "1 John": "1JN", "1Jn": "1JN", "1 Jn": "1JN", "I John": "1JN",
  "2 John": "2JN", "2Jn": "2JN", "2 Jn": "2JN", "II John": "2JN",
  "3 John": "3JN", "3Jn": "3JN", "3 Jn": "3JN", "III John": "3JN",
  "Jude": "JUD", "Jud": "JUD",
  "Revelation": "REV", "Rev": "REV", "Re": "REV"
};

const BOOK_DISPLAY = {
  GEN: "Gen", EXO: "Ex", LEV: "Lev", NUM: "Num", DEU: "Deut", JOS: "Josh", JDG: "Judg", RUT: "Ruth",
  "1SA": "1 Sam", "2SA": "2 Sam", "1KI": "1 Kgs", "2KI": "2 Kgs", "1CH": "1 Chr", "2CH": "2 Chr",
  EZR: "Ezra", NEH: "Neh", EST: "Est", JOB: "Job", PSA: "Ps", PRO: "Prov", ECC: "Eccl", SNG: "Song",
  ISA: "Isa", JER: "Jer", LAM: "Lam", EZK: "Ezek", DAN: "Dan", HOS: "Hos", JOL: "Joel", AMO: "Amos",
  OBA: "Obad", JON: "Jonah", MIC: "Mic", NAM: "Nah", HAB: "Hab", ZEP: "Zeph", HAG: "Hag", ZEC: "Zech", MAL: "Mal",
  MAT: "Matt", MRK: "Mark", LUK: "Luke", JHN: "John", ACT: "Acts", ROM: "Rom", "1CO": "1 Cor", "2CO": "2 Cor",
  GAL: "Gal", EPH: "Eph", PHP: "Phil", COL: "Col", "1TH": "1 Thess", "2TH": "2 Thess", "1TI": "1 Tim", "2TI": "2 Tim",
  TIT: "Titus", PHM: "Phlm", HEB: "Heb", JAS: "Jas", "1PE": "1 Pet", "2PE": "2 Pet", "1JN": "1 John", "2JN": "2 John",
  "3JN": "3 John", JUD: "Jude", REV: "Rev"
};

const normalizeWhitespace = (value) => String(value || "").replace(/\s+/g, " ").trim();

const resolveBookId = (bookName) => {
  if (!bookName) return null;
  const normalized = normalizeWhitespace(bookName).replace(/\./g, "");
  if (BOOK_IDS[normalized]) return BOOK_IDS[normalized];
  const found = Object.keys(BOOK_IDS).find((key) => key.toLowerCase() === normalized.toLowerCase());
  return found ? BOOK_IDS[found] : null;
};

const expandVerseSpec = (verseSpec) => {
  const numbers = [];
  String(verseSpec || "")
    .replace(/[–—]/g, "-")
    .split(",")
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .forEach((chunk) => {
      if (/^\d+-\d+$/.test(chunk)) {
        const [start, end] = chunk.split("-").map(Number);
        const step = start <= end ? 1 : -1;
        for (let v = start; step > 0 ? v <= end : v >= end; v += step) numbers.push(v);
        return;
      }
      const value = Number(chunk);
      if (Number.isFinite(value)) numbers.push(value);
    });
  return Array.from(new Set(numbers)).sort((a, b) => a - b);
};

// "Book Ch:V" / "Book Ch:V-V2" / "Book Ch:V,V2" optionally followed by "| note".
const REF_PATTERN = /^([1-3]?\s?[A-Za-z.]+(?:\s+[A-Za-z.]+)*)\s+(\d+):([\d\s,\-]+)$/;

const parseRefLine = (line) => {
  const [refPart, ...noteParts] = String(line).split("|");
  const ref = normalizeWhitespace(refPart);
  const note = normalizeWhitespace(noteParts.join("|"));
  const match = ref.match(REF_PATTERN);
  if (!match) return { error: `Could not parse reference: "${line}"` };

  const bookText = normalizeWhitespace(match[1]);
  const bookId = resolveBookId(bookText);
  if (!bookId) return { error: `Unknown book in reference: "${line}"` };

  const chapter = Number(match[2]);
  const verses = expandVerseSpec(match[3]);
  if (!verses.length) return { error: `No verse numbers parsed in reference: "${line}"` };

  return { bookId, chapter, verses, note };
};

const buildChapterOffsets = (bibleBooks) => {
  const offsetsByBook = {};
  bibleBooks.forEach((book) => {
    const chapters = Array.isArray(book.chapters) ? book.chapters : [];
    let running = 0;
    const chapterOffsets = [0];
    chapters.forEach((chapter) => {
      chapterOffsets.push(running);
      const count = Array.isArray(chapter.verses) ? chapter.verses.length : (Number(chapter.verseCount) || 0);
      running += count;
    });
    offsetsByBook[book.id] = chapterOffsets;
  });
  return offsetsByBook;
};

const toAbsoluteVerse = (bookId, chapter, verse, offsetsByBook, bibleDataById) => {
  const book = bibleDataById[bookId];
  if (!book || !Array.isArray(book.chapters)) return null;
  if (chapter < 1 || verse < 1 || chapter > book.chapters.length) return null;
  const chapterData = book.chapters[chapter - 1];
  const offset = (offsetsByBook[bookId] || [])[chapter] ?? 0;

  if (Array.isArray(chapterData.verses) && chapterData.verses.length > 0) {
    const idx = chapterData.verses.findIndex((entry) => Number(entry.n ?? entry.number) === verse);
    return idx === -1 ? null : offset + idx + 1;
  }
  const verseCount = Number(chapterData.verseCount) || 0;
  return verse > verseCount ? null : offset + verse;
};

const main = () => {
  if (!fs.existsSync(SOURCE_PATH)) {
    console.error(`Source file not found: ${SOURCE_PATH}`);
    process.exit(1);
  }

  const source = JSON.parse(fs.readFileSync(SOURCE_PATH, "utf8"));
  const rawBibleData = JSON.parse(fs.readFileSync(BIBLE_DATA_PATH, "utf8"));
  const bibleBooks = Array.isArray(rawBibleData.books) ? rawBibleData.books : [];
  const bibleDataById = bibleBooks.reduce((acc, book) => {
    if (book && book.id) acc[book.id] = book;
    return acc;
  }, {});
  const offsetsByBook = buildChapterOffsets(bibleBooks);

  const result = {};
  const warnings = [];
  let verseEntriesAdded = 0;

  Object.entries(source).forEach(([topicName, refLines]) => {
    if (!Array.isArray(refLines)) {
      warnings.push(`Topic "${topicName}": expected an array of reference strings, skipping.`);
      return;
    }

    const referenceMaps = {};

    refLines.forEach((line) => {
      const parsed = parseRefLine(line);
      if (parsed.error) {
        warnings.push(`Topic "${topicName}": ${parsed.error}`);
        return;
      }

      parsed.verses.forEach((verse) => {
        const absoluteVerse = toAbsoluteVerse(parsed.bookId, parsed.chapter, verse, offsetsByBook, bibleDataById);
        if (!absoluteVerse) {
          warnings.push(`Topic "${topicName}": invalid chapter/verse ${parsed.bookId} ${parsed.chapter}:${verse}`);
          return;
        }

        if (!referenceMaps[parsed.bookId]) referenceMaps[parsed.bookId] = [];
        const displayBook = BOOK_DISPLAY[parsed.bookId] || parsed.bookId;
        referenceMaps[parsed.bookId].push({
          verse: absoluteVerse,
          subtopics: parsed.note ? [parsed.note] : [],
          refs: [`${displayBook} ${parsed.chapter}:${verse}`]
        });
        verseEntriesAdded += 1;
      });
    });

    const books = Object.keys(referenceMaps).sort();
    if (books.length === 0) {
      warnings.push(`Topic "${topicName}": no valid references, skipping topic.`);
      return;
    }

    books.forEach((bookId) => {
      referenceMaps[bookId].sort((a, b) => a.verse - b.verse);
    });

    result[topicName] = {
      name: topicName,
      references: referenceMaps,
      books
    };
  });

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(result, null, 2), "utf8");

  console.log(`Wrote ${Object.keys(result).length} topic(s), ${verseEntriesAdded} verse entries to ${OUTPUT_PATH}`);
  if (warnings.length) {
    console.log(`\n${warnings.length} warning(s):`);
    warnings.forEach((w) => console.log(`  - ${w}`));
  }
};

main();

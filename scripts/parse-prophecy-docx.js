const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const DEFAULT_DOCX = "C:\\Unity Projects\\_BibleDatasets\\Prophecy\\351-Old-Testament-Prophecies-Fulfilled-in-Jesus-Christ.docx";
const DEFAULT_OUTPUT = path.join(__dirname, "..", "data", "prophecy-topics-with-references.json");
const DEFAULT_REPORT = path.join(__dirname, "..", "data", "prophecy-parse-report.json");
const BIBLE_DATA_PATH = path.join(__dirname, "..", "data", "bible.json");

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
  "1 Kings": "1KI", "1Kgs": "1KI", "1 Kgs": "1KI", "I Kings": "1KI",
  "2 Kings": "2KI", "2Kgs": "2KI", "2 Kgs": "2KI", "II Kings": "2KI",
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

const decodeXml = (value) => String(value || "")
  .replace(/&amp;/g, "&")
  .replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'")
  .replace(/&#xA;|&#10;/g, "\n")
  .replace(/&#x9;|&#9;/g, "\t");

const normalizeWhitespace = (value) => String(value || "")
  .replace(/[\u2013\u2014]/g, "-")
  .replace(/\s+/g, " ")
  .trim();

const psEscape = (value) => String(value).replace(/'/g, "''");

const extractDocxXml = (docxPath) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "prophecy-docx-"));
  const zipPath = path.join(tempRoot, "source.zip");
  const extractPath = path.join(tempRoot, "unzipped");
  fs.copyFileSync(docxPath, zipPath);

  const command = `$zip='${psEscape(zipPath)}';$out='${psEscape(extractPath)}';Expand-Archive -Path $zip -DestinationPath $out -Force`;
  execFileSync("powershell", ["-NoProfile", "-Command", command], { stdio: "pipe" });

  const xmlPath = path.join(extractPath, "word", "document.xml");
  if (!fs.existsSync(xmlPath)) {
    throw new Error("Could not locate word/document.xml in DOCX archive.");
  }
  return { xml: fs.readFileSync(xmlPath, "utf8"), tempRoot };
};

const getCellText = (cellXml) => {
  const textNodes = [...cellXml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((m) => decodeXml(m[1]));
  return normalizeWhitespace(textNodes.join(" "));
};

const parseTableRows = (xml) => {
  const rows = [...xml.matchAll(/<w:tr(?:\s[^>]*)?>[\s\S]*?<\/w:tr>/g)].map((m) => m[0]);
  const parsed = [];

  rows.forEach((rowXml) => {
    const cells = [...rowXml.matchAll(/<w:tc(?:\s[^>]*)?>[\s\S]*?<\/w:tc>/g)].map((m) => getCellText(m[0]));
    if (cells.length < 3) return;

    const indexMatch = cells[0].match(/^\s*(\d+)\.\s*(.+)$/);
    if (!indexMatch) return;

    parsed.push({
      index: Number(indexMatch[1]),
      otRef: normalizeWhitespace(indexMatch[2]),
      prophecy: normalizeWhitespace(cells[1]),
      ntRefsRaw: normalizeWhitespace(cells[2])
    });
  });

  return parsed;
};

const resolveBookId = (bookName) => {
  if (!bookName) return null;
  const normalized = normalizeWhitespace(bookName).replace(/\./g, "").trim();
  if (BOOK_IDS[normalized]) return BOOK_IDS[normalized];

  const compact = normalized.replace(/\s+/g, " ");
  const found = Object.keys(BOOK_IDS).find((key) => key.toLowerCase() === compact.toLowerCase());
  return found ? BOOK_IDS[found] : null;
};

const expandVerseSpec = (verseSpec) => {
  const numbers = [];
  const chunks = String(verseSpec || "")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\s*-\s*/g, "-")
    .split(",")
    .map((chunk) => chunk.trim())
    .filter(Boolean);
  chunks.forEach((chunk) => {
    const clean = chunk;
    if (/^\d+-\d+$/.test(clean)) {
      const [start, end] = clean.split("-").map((v) => Number(v));
      if (!Number.isFinite(start) || !Number.isFinite(end)) return;
      const step = start <= end ? 1 : -1;
      for (let value = start; step > 0 ? value <= end : value >= end; value += step) {
        numbers.push(value);
      }
      return;
    }
    const value = Number(clean);
    if (Number.isFinite(value)) numbers.push(value);
  });

  return Array.from(new Set(numbers)).sort((a, b) => a - b);
};

const parseReferenceList = (rawRefs) => {
  const raw = normalizeWhitespace(rawRefs);
  const entries = [];
  const chapterOnlyEntries = [];
  const warnings = [];
  let lastBookId = null;
  let lastBookText = null;
  const pattern = /(?:\b([1-3]?\s?[A-Za-z\.]+(?:\s+[A-Za-z\.]+)*)\s+)?(\d+):([\d\s,\-]+)/g;
  const matches = [...raw.matchAll(pattern)];

  if (matches.length === 0) {
    const chapterOnlyTokens = raw.split(";").map((token) => normalizeWhitespace(token)).filter(Boolean);
    chapterOnlyTokens.forEach((token) => {
      const chapterOnlyMatch = token.match(/^([1-3]?\s?[A-Za-z\.]+(?:\s+[A-Za-z\.]+)*)\s+(\d+)$/);
      if (!chapterOnlyMatch) {
        warnings.push(`No chapter:verse patterns found in: ${raw}`);
        return;
      }

      const bookText = normalizeWhitespace(chapterOnlyMatch[1]);
      const bookId = resolveBookId(bookText);
      if (!bookId) {
        warnings.push(`Unknown book in chapter-only token: ${token}`);
        return;
      }

      chapterOnlyEntries.push({
        bookId,
        chapter: Number(chapterOnlyMatch[2]),
        source: token,
        bookText
      });
    });

    return { entries, chapterOnlyEntries, warnings };
  }

  matches.forEach((match) => {
    const token = normalizeWhitespace(match[0]);
    const bookTextRaw = match[1] ? normalizeWhitespace(match[1]) : null;
    const chapter = Number(match[2]);
    const verseSpec = normalizeWhitespace(match[3]);

    if (bookTextRaw) {
      const resolvedBookId = resolveBookId(bookTextRaw);
      if (!resolvedBookId) {
        warnings.push(`Unknown book in token: ${token}`);
        return;
      }
      lastBookId = resolvedBookId;
      lastBookText = bookTextRaw;
    }

    if (!lastBookId) {
      warnings.push(`No active book for token: ${token}`);
      return;
    }

    const verses = expandVerseSpec(verseSpec);
    if (!verses.length) {
      warnings.push(`No verse numbers parsed in token: ${token}`);
      return;
    }

    verses.forEach((verse) => entries.push({
      bookId: lastBookId,
      chapter,
      verse,
      source: token,
      bookText: lastBookText
    }));
  });

  return { entries, chapterOnlyEntries, warnings };
};

const buildChapterOffsets = (bibleData) => {
  const offsetsByBook = {};
  Object.entries(bibleData).forEach(([bookId, book]) => {
    const chapters = Array.isArray(book.chapters) ? book.chapters : [];
    let running = 0;
    const chapterOffsets = [0];
    chapters.forEach((chapter) => {
      chapterOffsets.push(running);
      const count = Array.isArray(chapter.verses)
        ? chapter.verses.length
        : (Number(chapter.verseCount) || 0);
      running += count;
    });
    offsetsByBook[bookId] = chapterOffsets;
  });
  return offsetsByBook;
};

const normalizeBibleDataById = (rawBibleData) => {
  if (rawBibleData && Array.isArray(rawBibleData.books)) {
    return rawBibleData.books.reduce((acc, book) => {
      if (book && book.id) {
        acc[book.id] = book;
      }
      return acc;
    }, {});
  }
  return rawBibleData || {};
};

const toAbsoluteVerse = (bookId, chapter, verse, offsetsByBook, bibleData) => {
  const book = bibleData[bookId];
  if (!book || !Array.isArray(book.chapters)) return null;
  if (!Number.isFinite(chapter) || !Number.isFinite(verse) || chapter < 1 || verse < 1) return null;
  if (chapter > book.chapters.length) return null;
  const chapterData = book.chapters[chapter - 1];

  const offsets = offsetsByBook[bookId] || [];
  const offset = offsets[chapter] ?? 0;

  if (Array.isArray(chapterData.verses) && chapterData.verses.length > 0) {
    const idx = chapterData.verses.findIndex((entry) => Number(entry.n) === verse);
    if (idx === -1) return null;
    return offset + idx + 1;
  }

  const verseCount = Number(chapterData.verseCount) || 0;
  if (verse > verseCount) return null;
  return offset + verse;
};

const buildOutput = (rows, bibleData) => {
  const offsetsByBook = buildChapterOffsets(bibleData);
  const result = {};

  const report = {
    rowsParsed: rows.length,
    rowsWithReferences: 0,
    topicsCreated: 0,
    verseEntriesAdded: 0,
    rowWarnings: []
  };

  rows.forEach((row) => {
    const topicKey = `${row.index}. ${row.prophecy}`;
    const topicName = row.prophecy;
    const referenceMaps = {};

    const addVerseEntry = (entry, subtopicLabel, rawSource) => {
      const absoluteVerse = toAbsoluteVerse(entry.bookId, entry.chapter, entry.verse, offsetsByBook, bibleData);
      if (!absoluteVerse) {
        report.rowWarnings.push({
          row: row.index,
          warnings: [`Invalid chapter/verse: ${entry.bookId} ${entry.chapter}:${entry.verse}`],
          raw: rawSource
        });
        return;
      }

      if (!referenceMaps[entry.bookId]) {
        referenceMaps[entry.bookId] = new Map();
      }

      const rowMap = referenceMaps[entry.bookId];
      const hadEntry = rowMap.has(absoluteVerse);
      const existing = rowMap.get(absoluteVerse) || {
        verse: absoluteVerse,
        subtopics: new Set(),
        refs: new Set()
      };

      const displayBook = BOOK_DISPLAY[entry.bookId] || entry.bookText || entry.bookId;
      existing.subtopics.add(subtopicLabel);
      existing.refs.add(`${displayBook} ${entry.chapter}:${entry.verse}`);
      rowMap.set(absoluteVerse, existing);

      if (!hadEntry) {
        report.verseEntriesAdded += 1;
      }
    };

    const processParsedRefs = (parsedRefs, sourceKind, rawSource) => {
      const subtopicLabel = sourceKind === "ot"
        ? `Prophecy (OT): ${row.otRef}`
        : `Fulfillment (NT): ${row.ntRefsRaw}`;

      const { entries, chapterOnlyEntries, warnings } = parsedRefs;
      if (warnings.length > 0) {
        report.rowWarnings.push({
          row: row.index,
          warnings: warnings.map((warning) => `[${sourceKind.toUpperCase()}] ${warning}`),
          raw: rawSource
        });
      }

      entries.forEach((entry) => {
        addVerseEntry(entry, subtopicLabel, rawSource);
      });

      chapterOnlyEntries.forEach((entry) => {
        const book = bibleData[entry.bookId];
        if (!book || !Array.isArray(book.chapters) || entry.chapter < 1 || entry.chapter > book.chapters.length) {
          report.rowWarnings.push({
            row: row.index,
            warnings: [`[${sourceKind.toUpperCase()}] Invalid chapter reference: ${entry.bookId} ${entry.chapter}`],
            raw: rawSource
          });
          return;
        }

        const chapterData = book.chapters[entry.chapter - 1];
        const verseNumbers = Array.isArray(chapterData.verses) && chapterData.verses.length > 0
          ? chapterData.verses.map((item) => Number(item.n)).filter((value) => Number.isFinite(value) && value > 0)
          : Array.from({ length: Number(chapterData.verseCount) || 0 }, (_, index) => index + 1);

        verseNumbers.forEach((verse) => {
          addVerseEntry({
            bookId: entry.bookId,
            chapter: entry.chapter,
            verse,
            bookText: entry.bookText
          }, subtopicLabel, rawSource);
        });
      });
    };

    const otParsed = parseReferenceList(row.otRef);
    const ntParsed = parseReferenceList(row.ntRefsRaw);
    processParsedRefs(otParsed, "ot", row.otRef);
    processParsedRefs(ntParsed, "nt", row.ntRefsRaw);

    const books = [];
    const references = {};
    Object.entries(referenceMaps).forEach(([bookId, verseMap]) => {
      const verseList = Array.from(verseMap.values())
        .map((entry) => ({
          verse: entry.verse,
          subtopics: Array.from(entry.subtopics),
          refs: Array.from(entry.refs)
        }))
        .sort((a, b) => a.verse - b.verse);
      references[bookId] = verseList;
      books.push(bookId);
    });

    if (books.length === 0) {
      return;
    }

    report.rowsWithReferences += 1;
    report.topicsCreated += 1;
    result[topicKey] = {
      name: topicName,
      references,
      books: books.sort()
    };
  });

  return { result, report };
};

const main = () => {
  const docxPath = process.argv[2] || DEFAULT_DOCX;
  const outputPath = process.argv[3] || DEFAULT_OUTPUT;
  const reportPath = process.argv[4] || DEFAULT_REPORT;

  if (!fs.existsSync(docxPath)) {
    console.error(`DOCX not found: ${docxPath}`);
    process.exit(1);
  }
  if (!fs.existsSync(BIBLE_DATA_PATH)) {
    console.error(`Bible data not found: ${BIBLE_DATA_PATH}`);
    process.exit(1);
  }

  const rawBibleData = JSON.parse(fs.readFileSync(BIBLE_DATA_PATH, "utf8"));
  const bibleData = normalizeBibleDataById(rawBibleData);
  const { xml, tempRoot } = extractDocxXml(docxPath);
  const rows = parseTableRows(xml);
  const { result, report } = buildOutput(rows, bibleData);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  fs.rmSync(tempRoot, { recursive: true, force: true });

  console.log(`Parsed ${report.rowsParsed} rows (${report.rowsWithReferences} with refs).`);
  console.log(`Wrote ${outputPath}`);
  console.log(`Wrote ${reportPath}`);
  console.log(`Created ${report.topicsCreated} searchable prophecy topics.`);
  console.log(`Verse entries processed: ${report.verseEntriesAdded}.`);
  if (report.rowWarnings.length > 0) {
    console.log(`Warnings: ${report.rowWarnings.length} row-level issues (see report JSON).`);
  }
};

main();

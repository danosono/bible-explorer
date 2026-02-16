const fs = require("fs/promises");
const path = require("path");

const inputDir = process.argv[2];
const outputRoot = process.argv[3] || path.resolve(__dirname, "..", "data");

if (!inputDir) {
  console.error("Usage: node scripts/parse-usfm.js <usfm-dir> [output-dir]");
  process.exit(1);
}

const sanitizeText = (text) => {
  let cleaned = text;
  cleaned = cleaned.replace(/\\f\s+[\s\S]*?\\f\*/g, "");
  cleaned = cleaned.replace(/\\x\s+[\s\S]*?\\x\*/g, "");
  cleaned = cleaned.replace(/\\w\s+([^|]+)\|[^\\]*?\\w\*/g, "$1");
  cleaned = cleaned.replace(/\\[a-z0-9*+]+/gi, "");
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  return cleaned;
};

const parseBooknames = async (dir) => {
  const filePath = path.join(dir, "booknames.xml");
  try {
    const xml = await fs.readFile(filePath, "utf8");
    const map = new Map();
    const regex = /<book[^>]*(?:code|id)="([A-Z0-9]+)"[^>]*(?:long|name)="([^"]+)"/g;
    let match;
    while ((match = regex.exec(xml))) {
      map.set(match[1], match[2]);
    }
    return map;
  } catch (error) {
    return new Map();
  }
};

const parseUsfmFile = async (filePath, nameMap) => {
  const content = await fs.readFile(filePath, "utf8");
  const lines = content.split(/\r?\n/);

  let bookId = "";
  let bookName = "";
  const chapters = [];
  const chapterMap = new Map();
  let currentChapter = null;
  let currentVerse = null;

  const ensureChapter = (number) => {
    if (!chapterMap.has(number)) {
      const chapter = { number, verseCount: 0, verses: [] };
      chapterMap.set(number, chapter);
      chapters.push(chapter);
    }
    return chapterMap.get(number);
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith("\\id")) {
      const parts = line.split(/\s+/);
      bookId = parts[1] || bookId;
      const restName = parts.slice(2).join(" ").trim();
      bookName = restName || nameMap.get(bookId) || bookId;
      continue;
    }

    if (line.startsWith("\\c")) {
      const parts = line.split(/\s+/);
      const chapterNumber = Number(parts[1]);
      if (!Number.isNaN(chapterNumber)) {
        currentChapter = ensureChapter(chapterNumber);
        currentVerse = null;
      }
      continue;
    }

    if (line.startsWith("\\v")) {
      const match = line.match(/^\\v\s+([0-9]+[a-zA-Z]?)\s*(.*)$/);
      if (!match || !currentChapter) continue;
      const verseId = match[1];
      const verseText = sanitizeText(match[2] || "");
      const verse = { n: verseId, text: verseText };
      currentChapter.verses.push(verse);
      currentChapter.verseCount += 1;
      currentVerse = verse;
      continue;
    }

    if (currentVerse) {
      // Skip section headers (\s1, \s2, etc), cross-references (\r), and their content
      if (line.startsWith("\\s") || line.startsWith("\\r")) {
        continue;
      }
      const extra = sanitizeText(line);
      if (extra) {
        currentVerse.text = (currentVerse.text + " " + extra).trim();
      }
    }
  }

  const verseCount = chapters.reduce((sum, chapter) => sum + chapter.verseCount, 0);
  const book = {
    id: bookId || path.parse(filePath).name.toUpperCase(),
    name: bookName || nameMap.get(bookId) || bookId,
    chapterCount: chapters.length,
    verseCount,
    chapters
  };

  return book;
};

const writeJson = async (filePath, data) => {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
};

const run = async () => {
  const nameMap = await parseBooknames(inputDir);
  const entries = await fs.readdir(inputDir, { withFileTypes: true });
  const usfmFiles = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".sfm"))
    .map((entry) => path.join(inputDir, entry.name));

  if (usfmFiles.length === 0) {
    console.error("No .sfm files found in", inputDir);
    process.exit(1);
  }

  const books = [];

  for (const file of usfmFiles) {
    const book = await parseUsfmFile(file, nameMap);
    books.push(book);
  }

  books.sort((a, b) => a.id.localeCompare(b.id));

  const totalVerses = books.reduce((sum, book) => sum + book.verseCount, 0);
  const bible = {
    meta: {
      source: "BSB USFM",
      buildDate: new Date().toISOString().slice(0, 10),
      totalVerses
    },
    books
  };

  const summary = {
    meta: {
      source: "BSB USFM",
      buildDate: bible.meta.buildDate,
      totalVerses
    },
    books: books.map((book) => ({
      id: book.id,
      name: book.name,
      verseCount: book.verseCount,
      chapterCount: book.chapterCount
    }))
  };

  await writeJson(path.join(outputRoot, "bible.json"), bible);
  await writeJson(path.join(outputRoot, "books-summary.json"), summary);

  for (const book of books) {
    await writeJson(path.join(outputRoot, "books", book.id + ".json"), book);
    for (const chapter of book.chapters) {
      const chapterPayload = {
        bookId: book.id,
        bookName: book.name,
        number: chapter.number,
        verseCount: chapter.verseCount,
        verses: chapter.verses
      };
      await writeJson(
        path.join(outputRoot, "chapters", book.id, book.id + "-" + chapter.number + ".json"),
        chapterPayload
      );
    }
  }

  console.log("USFM parsed. Output at", outputRoot);
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});

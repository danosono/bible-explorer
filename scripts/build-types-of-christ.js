// Builds data/types-of-christ-with-references.json from the Gospelgo Web
// game's typology content (sibling repo GospelGoWebApp). GENERATED - never
// hand-edit the output, and there is no authoring file in this repo: the
// game is the single source of truth for which verse shows which feature of
// Christ, and this dataset is derived from it.
//
//   node scripts/build-types-of-christ.js
//
// Also runs automatically at the end of scripts/build-custom-dataset.js.
//
// Inputs (read-only, in the game repo):
//   public/content/motifs.json        the motif registry: { motifs: [{ id, label, blurb }] }
//   public/content/typology-foundations.json
//                                     optional hand-written topics that belong to no single
//                                     figure: { topics: [{ title, refs: ["Luke.24.25-27" |
//                                     { ref, note }] }] }. Emitted first, in file order; a
//                                     note becomes that verse's subtopic text.
//   public/content/quests/*.json      quests whose dialogue lines tag refs with motif ids,
//                                     either on the line ("motifs": [...], applies to every
//                                     ref on it) or per verse ({ "ref": "Eph.1.7", "motifs": [...] })
//
// Mapping:
//   topic            = one quest that has at least one motif-tagged ref, named by its `title`
//   verse subtopics  = the label of every motif tagged on that verse, then which side of the
//                      pairing it is on: "The type (Old Testament)" (the figure's own verse)
//                      or "Jesus fulfills the type" (a line marked `antitype: true`). Motif labels are shared verbatim across
//                      verses, so they are the groups the app's subtopic dropdown offers.
//   Refs with no motif tag are left out (counted in the summary line).
//
// The game repo is found at ../GospelGoWebApp, or wherever GOSPELGO_WEBAPP_DIR
// points. If it isn't there (Netlify, another machine) the script leaves the
// committed output alone and exits cleanly. If it IS there but the content is
// invalid (unknown motif id, malformed ref, verse that doesn't exist), nothing
// is written and the exit code is 1 - same strictness as the game's own loader.
//
// Output follows the same schema as the other datasets (see
// docs/treemap-and-datasets.md):
//   { "Topic Name": { name, references: { BOOKID: [{ verse, subtopics, refs }] }, books } }
// where `verse` is the absolute verse index within the book (not chapter:verse).

const fs = require("fs");
const path = require("path");

const GAME_DIR = process.env.GOSPELGO_WEBAPP_DIR
  || path.join(__dirname, "..", "..", "GospelGoWebApp");
const MOTIFS_PATH = path.join(GAME_DIR, "public", "content", "motifs.json");
const QUESTS_DIR = path.join(GAME_DIR, "public", "content", "quests");
const OUTPUT_PATH = path.join(__dirname, "..", "data", "types-of-christ-with-references.json");
const BIBLE_DATA_PATH = path.join(__dirname, "..", "data", "bible.json");

const FOUNDATIONS_PATH = path.join(GAME_DIR, "public", "content", "typology-foundations.json");

// Which side of the pairing a verse is on: the Old Testament figure's own
// story, or Jesus (a dialogue line marked `antitype: true` in the game).
const TYPE_LABEL = "The type (Old Testament)";
const FULFILLMENT_LABEL = "Jesus fulfills the type";

// Duplicated from the game's scripts/build-bsb-books.mjs (OSIS book
// abbreviation -> this repo's USFM book id). Each script here is
// self-contained, same convention as the scripts/parse-*.js files.
const OSIS_TO_USFM = {
  Gen: "GEN", Exod: "EXO", Lev: "LEV", Num: "NUM", Deut: "DEU", Josh: "JOS", Judg: "JDG", Ruth: "RUT",
  "1Sam": "1SA", "2Sam": "2SA", "1Kgs": "1KI", "2Kgs": "2KI", "1Chr": "1CH", "2Chr": "2CH",
  Ezra: "EZR", Neh: "NEH", Esth: "EST", Job: "JOB", Ps: "PSA", Prov: "PRO", Eccl: "ECC", Song: "SNG",
  Isa: "ISA", Jer: "JER", Lam: "LAM", Ezek: "EZK", Dan: "DAN", Hos: "HOS", Joel: "JOL", Amos: "AMO",
  Obad: "OBA", Jonah: "JON", Mic: "MIC", Nah: "NAM", Hab: "HAB", Zeph: "ZEP", Hag: "HAG", Zech: "ZEC", Mal: "MAL",
  Matt: "MAT", Mark: "MRK", Luke: "LUK", John: "JHN", Acts: "ACT", Rom: "ROM", "1Cor": "1CO", "2Cor": "2CO",
  Gal: "GAL", Eph: "EPH", Phil: "PHP", Col: "COL", "1Thess": "1TH", "2Thess": "2TH", "1Tim": "1TI", "2Tim": "2TI",
  Titus: "TIT", Phlm: "PHM", Heb: "HEB", Jas: "JAS", "1Pet": "1PE", "2Pet": "2PE",
  "1John": "1JN", "2John": "2JN", "3John": "3JN", Jude: "JUD", Rev: "REV"
};

// Duplicated from scripts/build-custom-dataset.js.
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

// Same grammar as the game's parseOsisRef (src/content/scripture.ts):
// "Gen.37.2" or "Gen.37.3-4" - one chapter, one verse or a verse range.
const OSIS_REF_PATTERN = /^([1-3]?[A-Za-z]+)\.(\d+)\.(\d+)(?:-(\d+))?$/;

const parseOsisRef = (ref) => {
  const match = String(ref).match(OSIS_REF_PATTERN);
  if (!match) return { error: `malformed ref "${ref}" (expected e.g. "Gen.37.2" or "Gen.37.3-4")` };
  const bookId = OSIS_TO_USFM[match[1]];
  if (!bookId) return { error: `unknown book "${match[1]}" in ref "${ref}"` };
  const chapter = Number(match[2]);
  const start = Number(match[3]);
  const end = match[4] === undefined ? start : Number(match[4]);
  if (end < start) return { error: `verse range runs backwards in ref "${ref}"` };
  const verses = [];
  for (let v = start; v <= end; v += 1) verses.push(v);
  return { bookId, chapter, verses };
};

// Duplicated from scripts/build-custom-dataset.js.
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

// Returns true when the output is up to date (written, or deliberately left
// alone because the game repo isn't on this machine), false on invalid content.
const main = () => {
  if (!fs.existsSync(MOTIFS_PATH) || !fs.existsSync(QUESTS_DIR)) {
    console.log(`Types of Christ: game repo not found at ${GAME_DIR} - leaving ${path.basename(OUTPUT_PATH)} as committed.`);
    return true;
  }

  const errors = [];

  const registry = JSON.parse(fs.readFileSync(MOTIFS_PATH, "utf8"));
  const labelById = new Map();
  (Array.isArray(registry.motifs) ? registry.motifs : []).forEach((motif, i) => {
    if (!motif || typeof motif.id !== "string" || typeof motif.label !== "string" || !motif.label.trim()) {
      errors.push(`motifs.json motifs[${i}]: needs a string id and a non-empty label`);
      return;
    }
    if (labelById.has(motif.id)) errors.push(`motifs.json: duplicate id "${motif.id}"`);
    labelById.set(motif.id, motif.label.trim());
  });

  const rawBibleData = JSON.parse(fs.readFileSync(BIBLE_DATA_PATH, "utf8"));
  const bibleBooks = Array.isArray(rawBibleData.books) ? rawBibleData.books : [];
  const bibleDataById = bibleBooks.reduce((acc, book) => {
    if (book && book.id) acc[book.id] = book;
    return acc;
  }, {});
  const offsetsByBook = buildChapterOffsets(bibleBooks);

  const result = {};
  let verseEntries = 0;
  let untaggedRefs = 0;
  const usedMotifIds = new Set();

  // Hand-written topics that belong to no single figure (e.g. the verses
  // showing Scripture itself points us to Christ in the Old Testament).
  // Listed first, in the file's own order. Optional - a missing file is fine.
  if (fs.existsSync(FOUNDATIONS_PATH)) {
    const foundations = JSON.parse(fs.readFileSync(FOUNDATIONS_PATH, "utf8"));
    (Array.isArray(foundations.topics) ? foundations.topics : []).forEach((topic, topicIndex) => {
      const where = `typology-foundations.json topics[${topicIndex}]`;
      const topicName = topic && typeof topic.title === "string" ? topic.title.trim() : "";
      if (!topicName) {
        errors.push(`${where}: missing title`);
        return;
      }
      const versesByBook = {};
      (Array.isArray(topic.refs) ? topic.refs : []).forEach((entry) => {
        const ref = typeof entry === "string" ? entry : entry && entry.ref;
        const note = entry && typeof entry === "object" && typeof entry.note === "string" ? entry.note.trim() : "";
        const parsed = parseOsisRef(ref);
        if (parsed.error) {
          errors.push(`${where} ("${topicName}"): ${parsed.error}`);
          return;
        }
        parsed.verses.forEach((verseNumber) => {
          const absolute = toAbsoluteVerse(parsed.bookId, parsed.chapter, verseNumber, offsetsByBook, bibleDataById);
          if (!absolute) {
            errors.push(`${where} ("${topicName}"): no such verse ${parsed.bookId} ${parsed.chapter}:${verseNumber} (ref "${ref}")`);
            return;
          }
          const byVerse = versesByBook[parsed.bookId] || (versesByBook[parsed.bookId] = new Map());
          let record = byVerse.get(absolute);
          if (!record) {
            record = { verse: absolute, chapter: parsed.chapter, verseNumber, notes: [] };
            byVerse.set(absolute, record);
          }
          if (note && !record.notes.includes(note)) record.notes.push(note);
        });
      });
      const books = Object.keys(versesByBook).sort();
      if (books.length === 0) {
        errors.push(`${where} ("${topicName}"): no refs`);
        return;
      }
      const references = {};
      books.forEach((bookId) => {
        const displayBook = BOOK_DISPLAY[bookId] || bookId;
        references[bookId] = Array.from(versesByBook[bookId].values())
          .sort((a, b) => a.verse - b.verse)
          .map((record) => ({
            verse: record.verse,
            subtopics: record.notes,
            refs: [`${displayBook} ${record.chapter}:${record.verseNumber}`]
          }));
        verseEntries += references[bookId].length;
      });
      if (result[topicName]) errors.push(`${where}: duplicate title "${topicName}"`);
      result[topicName] = { name: topicName, references, books };
    });
  }

  const questFiles = fs.readdirSync(QUESTS_DIR).filter((name) => name.endsWith(".json")).sort();
  questFiles.forEach((fileName) => {
    const quest = JSON.parse(fs.readFileSync(path.join(QUESTS_DIR, fileName), "utf8"));
    const topicName = typeof quest.title === "string" && quest.title.trim() ? quest.title.trim() : fileName;

    // bookId -> absolute verse -> { verse, chapter, verseNumber, motifLabels, sides }
    const versesByBook = {};

    (Array.isArray(quest.stages) ? quest.stages : []).forEach((stage) => {
      (Array.isArray(stage.dialogue) ? stage.dialogue : []).forEach((line, lineIndex) => {
        const where = `${fileName} stage "${stage.id}" dialogue[${lineIndex}]`;
        const lineMotifs = Array.isArray(line.motifs) ? line.motifs : [];
        const side = line.antitype === true ? FULFILLMENT_LABEL : TYPE_LABEL;

        (Array.isArray(line.refs) ? line.refs : []).forEach((entry) => {
          const ref = typeof entry === "string" ? entry : entry && entry.ref;
          const ownMotifs = entry && typeof entry === "object" && Array.isArray(entry.motifs) ? entry.motifs : [];
          const motifIds = Array.from(new Set([...lineMotifs, ...ownMotifs]));

          motifIds.forEach((id) => {
            if (!labelById.has(id)) errors.push(`${where}: unknown motif id "${id}" on ref "${ref}"`);
          });

          const parsed = parseOsisRef(ref);
          if (parsed.error) {
            errors.push(`${where}: ${parsed.error}`);
            return;
          }
          if (motifIds.length === 0) {
            untaggedRefs += 1;
            return;
          }

          parsed.verses.forEach((verseNumber) => {
            const absolute = toAbsoluteVerse(parsed.bookId, parsed.chapter, verseNumber, offsetsByBook, bibleDataById);
            if (!absolute) {
              errors.push(`${where}: no such verse ${parsed.bookId} ${parsed.chapter}:${verseNumber} (ref "${ref}")`);
              return;
            }
            const byVerse = versesByBook[parsed.bookId] || (versesByBook[parsed.bookId] = new Map());
            let record = byVerse.get(absolute);
            if (!record) {
              record = { verse: absolute, chapter: parsed.chapter, verseNumber, motifLabels: [], sides: [] };
              byVerse.set(absolute, record);
            }
            motifIds.forEach((id) => {
              usedMotifIds.add(id);
              const label = labelById.get(id);
              if (label && !record.motifLabels.includes(label)) record.motifLabels.push(label);
            });
            if (!record.sides.includes(side)) record.sides.push(side);
          });
        });
      });
    });

    const books = Object.keys(versesByBook).sort();
    if (books.length === 0) return; // quest has no motif tags yet - not a typology topic

    const references = {};
    books.forEach((bookId) => {
      const displayBook = BOOK_DISPLAY[bookId] || bookId;
      references[bookId] = Array.from(versesByBook[bookId].values())
        .sort((a, b) => a.verse - b.verse)
        .map((record) => ({
          verse: record.verse,
          subtopics: [...record.motifLabels, ...record.sides],
          refs: [`${displayBook} ${record.chapter}:${record.verseNumber}`]
        }));
      verseEntries += references[bookId].length;
    });

    if (result[topicName]) errors.push(`${fileName}: duplicate quest title "${topicName}"`);
    result[topicName] = { name: topicName, references, books };
  });

  if (errors.length) {
    console.error(`Types of Christ: ${errors.length} error(s) in the game content - ${path.basename(OUTPUT_PATH)} NOT written:`);
    errors.forEach((e) => console.error(`  - ${e}`));
    return false;
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(result, null, 2), "utf8");
  console.log(
    `Types of Christ: wrote ${Object.keys(result).length} topic(s), ${verseEntries} verse entries, `
    + `${usedMotifIds.size} of ${labelById.size} motifs used, ${untaggedRefs} untagged ref(s) skipped -> ${OUTPUT_PATH}`
  );
  const unused = Array.from(labelById.keys()).filter((id) => !usedMotifIds.has(id));
  if (unused.length) console.log(`  Motifs in the registry not tagged on any verse: ${unused.join(", ")}`);
  return true;
};

if (require.main === module) {
  if (!main()) process.exit(1);
}

module.exports = { main };

const fs = require("fs");
const path = require("path");
const { BOOK_IDS } = require("./lib/naves-book-ids");

const INPUT_PATH = process.argv[2] || path.join(__dirname, "..", "source", "Naves.txt");
const OUTPUT_PATH = process.argv[3] || path.join(__dirname, "..", "data", "topics-input.json");

// Used only to find where a bullet's label text ends and its first
// scripture reference begins. Restricted to short, digit-prefixed, or
// otherwise abbreviation-shaped keys - full spelled-out book names
// (Jonah, Micah, Amos, Mark, Luke, John, James, Titus, ...) double as
// ordinary person/place names within label text (e.g. "Father of Jonah"),
// so including them causes false boundary matches. The corpus only ever
// cites scripture using the short forms anyway (confirmed empirically),
// so dropping the long forms here doesn't lose any real references -
// 'Jude' is kept as a special case since it has no shorter alias.
const BOOK_TOKEN_PATTERN = Object.keys(BOOK_IDS)
  .filter((key) => key.length <= 3 || /^[1-3]/.test(key) || key === "Jude")
  .sort((a, b) => b.length - a.length)
  .map((key) => key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  .join("|");
const FIRST_REF_BOUNDARY = new RegExp(`\\b(?:${BOOK_TOKEN_PATTERN})\\b\\s+\\d`);

// Given a list of raw ref fragments (book may be omitted when it's the same as the prior
// fragment, e.g. "Ex 6:23,25; 1Ch 6:3" -> ["Ex 6:23,25", "1Ch 6:3"], or just
// "23:13" continuing the same book), reconstructs fully-qualified
// "Book Chapter:Verse" strings.
const normalizeReferenceSequence = (refs) => {
  const normalized = [];
  let lastBook = null;
  let lastChapter = null;

  refs.forEach((raw) => {
    // Line-wrapped comma lists (e.g. a long Psalm 119 verse list split
    // across two physical lines) get rejoined with a space, e.g.
    // "84, 107,121" instead of "84,107,121" - strip it so the chapter:verse
    // and bare-verse regexes below still match.
    const text = raw.replace(/^with\s+/i, "").replace(/,\s+/g, ",").trim();
    if (!text) return;

    const fullMatch = text.match(/^([1-3]?\s?[A-Za-z]+)\s+(\d+)(?::([\d\-,]+))?$/);
    if (fullMatch) {
      const book = fullMatch[1].replace(/\s+/g, " ").trim();
      const chapter = fullMatch[2];
      const verse = fullMatch[3];
      lastBook = book;
      lastChapter = chapter;
      normalized.push(verse ? `${book} ${chapter}:${verse}` : `${book} ${chapter}`);
      return;
    }

    const chapterVerseMatch = text.match(/^(\d+):(\d[\d\-,]*)$/);
    if (chapterVerseMatch && lastBook) {
      lastChapter = chapterVerseMatch[1];
      normalized.push(`${lastBook} ${chapterVerseMatch[1]}:${chapterVerseMatch[2]}`);
      return;
    }

    const verseOnlyMatch = text.match(/^(\d[\d\-,]*)$/);
    if (verseOnlyMatch && lastBook) {
      if (lastChapter) {
        normalized.push(`${lastBook} ${lastChapter}:${verseOnlyMatch[1]}`);
      } else {
        normalized.push(`${lastBook} ${verseOnlyMatch[1]}`);
      }
      return;
    }

    normalized.push(text);
  });

  return normalized;
};

// Splits a bullet's text (marker already stripped) into { label, refs }.
// The label is everything before the first recognizable "Book chapter"
// token; everything from there on is reference data. Bullets with no
// recognizable reference (e.g. "Also called X", a pure "-See X" redirect)
// return refs: [].
const splitLabelAndRefs = (bulletText) => {
  const segments = bulletText.split(";").map((segment) => segment.trim()).filter(Boolean);
  if (!segments.length) return { label: "", refs: [] };

  const boundary = segments[0].match(FIRST_REF_BOUNDARY);
  if (!boundary) return { label: bulletText.trim(), refs: [] };

  const label = segments[0].slice(0, boundary.index).trim();
  const firstRef = segments[0].slice(boundary.index).trim();

  // Past this point we're entirely in reference territory (the label has
  // already been peeled off), so it's safe to also split on ".". A couple
  // of large OT/NT cross-reference topics use "." instead of ";" between
  // table rows, e.g. "Ga 3:8. Ge 17:7,19" - without this, periods like that
  // get stuck onto the end of the preceding verse and break the regexes in
  // normalizeReferenceSequence.
  const splitPeriods = (segment) => segment.split(".").map((part) => part.trim()).filter(Boolean);
  const fragments = [firstRef, ...segments.slice(1)].flatMap(splitPeriods);
  const refs = normalizeReferenceSequence(fragments);
  return { label, refs };
};

// Parses the CCEL plain-text edition into the same { topics: [{name, verses}] }
// shape parse-topics.js already consumes from the THML/XML parser, so the
// second stage (book ID resolution, verse-range expansion, etc.) is reused
// unchanged.
const parse = (text) => {
  const lines = text.split(/\r?\n/);

  const startIdx = lines.findIndex((line) => /^[A-Z]$/.test(line.trim()));
  let endIdx = lines.findIndex((line) => line.trim() === "References");
  if (endIdx === -1 || endIdx < startIdx) endIdx = lines.length;
  const body = lines.slice(startIdx === -1 ? 0 : startIdx, endIdx);

  const termOrder = [];
  const termBullets = new Map();
  let currentTerm = null;
  let currentBulletParts = [];

  const flushBullet = () => {
    if (!currentTerm || !currentBulletParts.length) {
      currentBulletParts = [];
      return;
    }
    const bulletText = currentBulletParts.join(" ").replace(/\s+/g, " ").trim();
    currentBulletParts = [];
    if (bulletText) termBullets.get(currentTerm).push(bulletText);
  };

  // Some entries nest a third level: a "-"/"." header with no refs of its
  // own (e.g. ".Methods employed in effecting"), followed by several
  // unmarked paragraphs - one per sub-item - separated from each other (and
  // from the header) only by blank lines, e.g.:
  //   .Methods employed in effecting
  //
  //   Sounding a trumpet Nu 10:9; Jud 3:27
  //
  //   Cutting oxen in pieces ... 1Sa 11:7
  // A blank line before an unmarked line means "new sub-item", not "wrapped
  // continuation of the previous line" - track that distinction here.
  let precededByBlank = true;

  for (const rawLine of body) {
    if (!rawLine.trim() || /^_+$/.test(rawLine.trim()) || /^[A-Z]$/.test(rawLine.trim())) {
      precededByBlank = true;
      continue;
    }

    const indent = rawLine.match(/^ */)[0].length;
    const content = rawLine.trim();
    const wasPrecededByBlank = precededByBlank;
    precededByBlank = false;

    if (indent <= 4) {
      flushBullet();
      currentTerm = content;
      if (!termBullets.has(currentTerm)) {
        termBullets.set(currentTerm, []);
        termOrder.push(currentTerm);
      }
      continue;
    }

    if (content.startsWith("-") || content.startsWith(".") || wasPrecededByBlank) {
      flushBullet();
      currentBulletParts.push(content);
    } else if (currentBulletParts.length) {
      currentBulletParts.push(content);
    }
    // A continuation line with no active bullet (shouldn't happen in
    // practice) is dropped rather than mis-attributed to the wrong bullet.
  }
  flushBullet();

  const topics = [];
  const seen = new Map();

  for (const term of termOrder) {
    for (const bulletRaw of termBullets.get(term)) {
      const withoutFootnotes = bulletRaw.replace(/\[\d+\]/g, "");
      const isTopLevel = withoutFootnotes.startsWith("-");
      const bulletBody = isTopLevel ? withoutFootnotes.slice(1).trim() : withoutFootnotes;

      if (/^See\b/i.test(bulletBody)) continue; // pure cross-reference redirect, no scripture refs

      const { label, refs } = splitLabelAndRefs(bulletBody);
      if (!refs.length) continue;

      const topicName = label ? `${term} - ${label}` : term;
      const verseString = Array.from(new Set(refs)).join("; ");
      const key = topicName.toLowerCase();
      const existingCount = seen.get(key) || 0;
      const finalName = existingCount > 0 ? `${topicName} (${existingCount + 1})` : topicName;
      seen.set(key, existingCount + 1);

      topics.push({ name: finalName, verses: verseString });
    }
  }

  return topics;
};

const main = () => {
  if (!fs.existsSync(INPUT_PATH)) {
    console.error(`Input file not found: ${INPUT_PATH}`);
    process.exit(1);
  }

  const text = fs.readFileSync(INPUT_PATH, "utf8");
  const topics = parse(text);
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify({ topics }, null, 2));
  console.log(`Wrote ${topics.length} topics to ${OUTPUT_PATH}`);
};

main();

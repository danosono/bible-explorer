const fs = require("fs");
const path = require("path");

const INPUT_PATH = process.argv[2] || "C:\\Unity Projects\\_BibleDatasets\\Naves\\Naves.xml";
const OUTPUT_PATH = process.argv[3] || path.join(__dirname, "..", "data", "topics-input.json");
const LIMIT = Number(process.argv[4] || 0);

const decodeEntities = (value) => {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#8211;|&ndash;/g, "-")
    .replace(/&#8212;|&mdash;/g, "-");
};

const stripTags = (value) => decodeEntities(value.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();

const normalizeTopicName = (value) => stripTags(value).replace(/\s+/g, " ").trim();

const getSubtopicLabel = (value) => {
  const text = normalizeTopicName(value);
  return text.replace(/^[-–—]\s*/, "").trim();
};

const normalizeReferenceSequence = (refs) => {
  const normalized = [];
  let lastBook = null;
  let lastChapter = null;

  refs.forEach((raw) => {
    const text = normalizeTopicName(raw);
    if (!text) {
      return;
    }

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

    const verseOnlyMatch = text.match(/^(\d[\d\-]*)$/);
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

const parse = (xml, limit = 0) => {
  const topics = [];
  const seen = new Map();
  const termDefRegex = /<term[^>]*>([^<]+)<\/term>\s*<def[^>]*type=\"Scripture References\"[^>]*>([\s\S]*?)<\/def>/gi;
  let match;

  while ((match = termDefRegex.exec(xml))) {
    const term = normalizeTopicName(match[1]);
    const defContent = match[2];
    const pRegex = /<p class=\"index[2-9]\"[^>]*>([\s\S]*?)<\/p>/gi;
    let pMatch;

    while ((pMatch = pRegex.exec(defContent))) {
      const pContent = pMatch[1];
      const subtopicRaw = pContent.split("<scripRef")[0] || "";
      const subtopic = getSubtopicLabel(subtopicRaw);
      const topicName = subtopic ? `${term} - ${subtopic}` : term;

      const refs = [];
      const scripRefRegex = /<scripRef\b([^>]*)>([^<]*)<\/scripRef>/gi;
      let refMatch;

      while ((refMatch = scripRefRegex.exec(pContent))) {
        const attributes = refMatch[1];
        const inner = refMatch[2];
        const passageMatch = attributes.match(/passage=\"([^\"]+)\"/i);
        const passage = passageMatch ? passageMatch[1] : "";
        const refText = normalizeTopicName(passage || inner);
        if (refText) {
          refs.push(refText);
        }
      }

      if (!refs.length) {
        continue;
      }

      const normalizedRefs = normalizeReferenceSequence(refs);
      const verseString = Array.from(new Set(normalizedRefs)).join("; ");
      const key = topicName.toLowerCase();
      const existingCount = seen.get(key) || 0;
      const finalName = existingCount > 0 ? `${topicName} (${existingCount + 1})` : topicName;
      seen.set(key, existingCount + 1);

      topics.push({ name: finalName, verses: verseString });

      if (limit && topics.length >= limit) {
        return topics;
      }
    }
  }

  return topics;
};

const main = () => {
  if (!fs.existsSync(INPUT_PATH)) {
    console.error(`Input file not found: ${INPUT_PATH}`);
    process.exit(1);
  }

  const xml = fs.readFileSync(INPUT_PATH, "utf8");
  const topics = parse(xml, LIMIT);
  const output = { topics };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
  console.log(`Wrote ${topics.length} topics to ${OUTPUT_PATH}`);
};

main();

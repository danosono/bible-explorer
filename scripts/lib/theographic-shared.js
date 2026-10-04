const fs = require('fs').promises;
const path = require('path');
const { BOOK_IDS } = require('./bsb-shared');

// Raw Theographic Bible Metadata export (json/ folder), outside the repo -
// same convention as the Berean xlsx sources read by parse-bsb-topics.js /
// parse-bsb-concordance.js.
const THEOGRAPHIC_JSON_DIR = 'C:/Unity Projects/_BibleDatasets/GospelGo_GoMap_Datasets/RawDataInclude/'
  + 'theographic-bible-metadata-master/theographic-bible-metadata-master/json';

// OSIS book abbreviations used by Theographic's `osisRef` field that aren't
// already covered by BOOK_IDS (which is tuned for Nave's/Berean-style
// abbreviations - e.g. it has '1Sa' but not the unspaced OSIS form '1Sam').
const OSIS_BOOK_ALIASES = {
  '1Sam': '1SA', '2Sam': '2SA',
  '1John': '1JN', '2John': '2JN', '3John': '3JN',
  'Obad': 'OBA', 'Phlm': 'PHM',
  'Esth': 'EST', 'Prov': 'PRO'
};

const OSIS_TO_BOOK_ID = { ...BOOK_IDS, ...OSIS_BOOK_ALIASES };

const loadTheographicJson = async (filename) => {
  const filePath = path.join(THEOGRAPHIC_JSON_DIR, filename);
  return JSON.parse(await fs.readFile(filePath, 'utf-8'));
};

// "Gen.1.1" -> { bookId: 'GEN', chapter: 1, verse: 1 }
const parseOsisRef = (osisRef) => {
  if (!osisRef) return null;
  const [bookAbbrev, chapterStr, verseStr] = osisRef.split('.');
  const bookId = OSIS_TO_BOOK_ID[bookAbbrev];
  if (!bookId) return null;
  const chapter = parseInt(chapterStr, 10);
  const verse = parseInt(verseStr, 10);
  if (!chapter || !verse) return null;
  return { bookId, chapter, verse };
};

// recordId -> osisRef, for every record in verses.json.
const buildVerseOsisMap = (versesJson) => {
  const map = new Map();
  for (const record of versesJson) {
    if (record.fields && record.fields.osisRef) {
      map.set(record.id, record.fields.osisRef);
    }
  }
  return map;
};

// recordId -> a field (default displayTitle), for people.json/places.json -
// used to resolve family/relationship IDs into readable names.
const buildIdNameMap = (recordsJson, field = 'displayTitle') => {
  const map = new Map();
  for (const record of recordsJson) {
    const name = record.fields && (record.fields[field] || record.fields.name);
    if (name) map.set(record.id, name);
  }
  return map;
};

// Easton's dictionaryText is one long string with no real paragraph breaks -
// each entry's source markup instead left behind runs of exactly 4 spaces
// where a paragraph break belongs (verified empirically: always follows a
// sentence-ending period, always precedes the next sentence's capital
// letter). Shorter 2-3 space runs are unrelated padding left around inline
// scripture citations (e.g. "(  Genesis 45:17-25  )") and must NOT be
// treated as paragraph breaks, so the split only matches 4+.
// A handful of entries carry a literal HTML entity (e.g. "1&nbsp;Corinthians")
// left over from the source markup - decode the few that actually occur
// rather than pulling in a full HTML-entity-decoding dependency for this.
const decodeStrayEntities = (text) => text
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&');

const splitDictionaryParagraphs = (text) => {
  if (!text) return [];
  return decodeStrayEntities(text)
    .split(/ {4,}/)
    .map((paragraph) => paragraph.replace(/ {2,}/g, ' ').trim())
    .filter(Boolean);
};

// `dictText` is the markdown-formatted sibling of `dictionaryText` (same
// Easton source, different export pass) - it uses real `\n` characters for
// paragraph breaks instead of 4-space runs, and markdown-style links
// (`[1 Chr. 7:8](/1chr#1Chr.7.8)`) for citations instead of plain parenthetical
// text. `dictionaryText` is only populated for ~120-200 of the ~1,800-1,900
// people/places that have *some* Easton entry - `dictText` covers the rest
// (verified: 1,693 people and 862 places have dictText but no dictionaryText),
// so both need handling or most minor entries would show no bio text at all.
const stripMarkdownLinks = (text) => text.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');

const splitDictTextParagraphs = (text) => {
  if (!text) return [];
  return decodeStrayEntities(stripMarkdownLinks(text))
    .split(/\n+/)
    .map((paragraph) => paragraph.replace(/ {2,}/g, ' ').trim())
    .filter(Boolean);
};

// Prefers the plain-text dictionaryText when present, falls back to the
// markdown dictText (always a 1-element array when present) otherwise.
const getEastonParagraphs = (fields) => {
  if (fields.dictionaryText && fields.dictionaryText.trim()) {
    return splitDictionaryParagraphs(fields.dictionaryText.trim());
  }
  if (Array.isArray(fields.dictText) && fields.dictText[0]) {
    return splitDictTextParagraphs(fields.dictText[0]);
  }
  return [];
};

// Theographic's alsoCalled/aliases fields are comma-separated strings with
// no guaranteed spacing (e.g. "Lord,Son,Lamb,Saviour,..." for Jesus) -
// normalize to a readable ", "-joined list.
const formatCommaList = (value) => {
  if (!value) return null;
  const parts = value.split(',').map((part) => part.trim()).filter(Boolean);
  return parts.length ? parts.join(', ') : null;
};

const resolveNames = (ids, idToName) => {
  if (!Array.isArray(ids)) return [];
  return ids.map((id) => idToName.get(id)).filter(Boolean);
};

// Theographic years are ISO 8601 astronomical year numbers: 0 = 1 BC, -1 = 2
// BC, positive values are plain AD years. "-4003" -> "4004 BC", "30" -> "AD 30".
const formatBibleYear = (yearStr) => {
  if (yearStr === undefined || yearStr === null || yearStr === '') return null;
  const year = parseInt(yearStr, 10);
  if (Number.isNaN(year)) return null;
  return year <= 0 ? `${-year + 1} BC` : `AD ${year}`;
};

// Builds a "c. 1572-1452 BC" / "c. 5 BC - AD 30" / "b. 1572 BC" style range
// from birthYear/deathYear strings, or null if neither is available.
const formatYearRange = (birthYearStr, deathYearStr) => {
  const birth = formatBibleYear(birthYearStr);
  const death = formatBibleYear(deathYearStr);
  if (birth && death) return `c. ${birth} – ${death}`;
  if (birth) return `b. ${birth}`;
  if (death) return `d. ${death}`;
  return null;
};

module.exports = {
  THEOGRAPHIC_JSON_DIR,
  loadTheographicJson,
  parseOsisRef,
  buildVerseOsisMap,
  buildIdNameMap,
  resolveNames,
  formatCommaList,
  splitDictionaryParagraphs,
  splitDictTextParagraphs,
  getEastonParagraphs,
  formatBibleYear,
  formatYearRange
};

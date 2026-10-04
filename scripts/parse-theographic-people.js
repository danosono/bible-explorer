const fs = require('fs').promises;
const path = require('path');
const { BOOK_ABBREVIATIONS, loadBibleData, getAbsoluteVerseIndex } = require('./lib/bsb-shared');
const {
  loadTheographicJson,
  parseOsisRef,
  buildVerseOsisMap,
  buildIdNameMap,
  resolveNames,
  formatCommaList,
  getEastonParagraphs,
  formatYearRange
} = require('./lib/theographic-shared');

// Builds one person's own bio piece - subtitle line, Easton's blurb, and
// resolved family relationships - straight from their own fields, with
// nothing merged or compared against anyone else.
const buildPersonBio = (fields, idToName, groupIdToName) => {
  const subtitleParts = [];
  if (fields.gender) subtitleParts.push(fields.gender);
  const years = formatYearRange(fields.birthYear, fields.deathYear);
  if (years) subtitleParts.push(years);
  const groups = resolveNames(fields.memberOf, groupIdToName).join(', ');
  if (groups) subtitleParts.push(`Member of ${groups}`);

  const familyParts = [];
  const father = resolveNames(fields.father, idToName).join(', ');
  const mother = resolveNames(fields.mother, idToName).join(', ');
  const partners = resolveNames(fields.partners, idToName).join(', ');
  const siblings = resolveNames(fields.siblings, idToName).join(', ');
  const children = resolveNames(fields.children, idToName).join(', ');
  if (father) familyParts.push(`Father: ${father}`);
  if (mother) familyParts.push(`Mother: ${mother}`);
  if (partners) familyParts.push(`Spouse: ${partners}`);
  if (siblings) familyParts.push(`Siblings: ${siblings}`);
  if (children) familyParts.push(`Children: ${children}`);

  const bio = {};
  if (subtitleParts.length) bio.subtitle = subtitleParts.join(' · ');
  const text = getEastonParagraphs(fields);
  if (text.length) bio.text = text;
  const alsoCalled = formatCommaList(fields.alsoCalled);
  if (alsoCalled) bio.alsoCalled = `Also called: ${alsoCalled}`;
  if (familyParts.length) bio.family = familyParts.join(' · ');
  return Object.keys(bio).length ? bio : null;
};

// Many minor/genealogical names are never disambiguated in the source data
// itself (Theographic flags them `ambiguous: true` - e.g. 3 different,
// unrelated "Abdi" records with no distinguishing info) and get merged into
// a single topic entry (see groupByDisplayTitle below). A single merged bio
// (intersecting every record's fields) would either show misleading info
// (one person's "Spouse"/"Children" presented as if it covered all of them,
// since the others simply have nothing there to conflict with it) or drop
// real info outright (each record's own Easton's write-up almost never
// matches another's verbatim, so it would always be discarded) - so a
// group of more than one person instead gets `bio.people`, one self-contained
// bio per person, with no merging at all.
const buildBio = (recordsFields, idToName, groupIdToName) => {
  if (recordsFields.length === 1) {
    return buildPersonBio(recordsFields[0], idToName, groupIdToName);
  }
  const people = recordsFields
    .map((fields) => buildPersonBio(fields, idToName, groupIdToName))
    .filter(Boolean);
  if (!people.length) return null;
  return {
    subtitle: `${recordsFields.length} biblical people share this name`,
    people
  };
};

async function parsePeople(bibleData) {
  console.log('Loading Theographic people.json / verses.json / peopleGroups.json...');
  const [peopleJson, versesJson, groupsJson] = await Promise.all([
    loadTheographicJson('people.json'),
    loadTheographicJson('verses.json'),
    loadTheographicJson('peopleGroups.json')
  ]);

  const verseOsisMap = buildVerseOsisMap(versesJson);
  const idToName = buildIdNameMap(peopleJson);
  const groupIdToName = buildIdNameMap(groupsJson, 'groupName');

  // displayTitle is Theographic's own disambiguated name, but a large chunk
  // of minor/genealogical records are never actually disambiguated in the
  // source data (flagged `ambiguous: true`) and share a bare name with other,
  // unrelated people - group by name first so those merge into one topic
  // entry instead of overwriting each other.
  const groups = new Map();
  let skippedNoProperName = 0;
  let skippedNoVerses = 0;
  for (const record of peopleJson) {
    const fields = record.fields || {};
    if (!fields.isProperName) { skippedNoProperName += 1; continue; }
    const name = fields.displayTitle || fields.name;
    if (!name || !Array.isArray(fields.verses) || fields.verses.length === 0) {
      skippedNoVerses += 1;
      continue;
    }
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(fields);
  }

  const result = {};
  const unknownBooks = new Map();

  for (const [name, recordsFields] of groups) {
    const references = {};
    const seenVerseIds = new Set();
    for (const fields of recordsFields) {
      for (const verseId of fields.verses) {
        if (seenVerseIds.has(verseId)) continue; // same verse mentions >1 merged person
        seenVerseIds.add(verseId);
        const osisRef = verseOsisMap.get(verseId);
        const parsed = parseOsisRef(osisRef);
        if (!parsed) {
          if (osisRef) {
            const bookLabel = osisRef.split('.')[0];
            unknownBooks.set(bookLabel, (unknownBooks.get(bookLabel) || 0) + 1);
          }
          continue;
        }
        const { bookId, chapter, verse } = parsed;
        const absoluteVerse = getAbsoluteVerseIndex(bibleData, bookId, chapter, verse);
        if (!absoluteVerse) continue;
        const abbreviation = BOOK_ABBREVIATIONS[bookId] || bookId;
        if (!references[bookId]) references[bookId] = [];
        references[bookId].push({
          verse: absoluteVerse,
          subtopics: [],
          refs: [`${abbreviation} ${chapter}:${verse}`]
        });
      }
    }

    if (Object.keys(references).length === 0) continue;

    const bio = buildBio(recordsFields, idToName, groupIdToName);
    const entry = { name, references };
    if (bio) entry.bio = bio;
    result[name] = entry;
  }

  for (const entry of Object.values(result)) {
    const bookIds = [];
    for (const [bookId, refs] of Object.entries(entry.references)) {
      refs.sort((a, b) => a.verse - b.verse);
      bookIds.push(bookId);
    }
    entry.books = bookIds;
  }

  console.log(`Skipped ${skippedNoProperName} non-proper-name records, ${skippedNoVerses} with no resolvable verses.`);
  if (unknownBooks.size) {
    console.log('Unknown OSIS book prefixes (count):', Object.fromEntries(unknownBooks));
  }
  return result;
}

async function main() {
  console.log('Loading bible.json for exact verse positions...');
  const bibleData = await loadBibleData();

  const people = await parsePeople(bibleData);

  const outputPath = path.join(__dirname, '..', 'data', 'theographic-people-with-references.json');
  await fs.writeFile(outputPath, JSON.stringify(people));

  const count = Object.keys(people).length;
  const totalRefs = Object.values(people)
    .reduce((sum, p) => sum + Object.values(p.references).flat().length, 0);
  console.log(`Wrote ${outputPath}`);
  console.log(`Parsed ${count} people with ${totalRefs} total verse references.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

const fs = require('fs').promises;
const path = require('path');
const { BOOK_ABBREVIATIONS, loadBibleData, getAbsoluteVerseIndex } = require('./lib/bsb-shared');
const {
  loadTheographicJson,
  parseOsisRef,
  buildVerseOsisMap,
  formatCommaList,
  getEastonParagraphs
} = require('./lib/theographic-shared');

// GospelGo's own map app (C:\Unity Projects\Builds\BiblePlaces), not a
// generic map pin. Its deep-link contract (src/deepLink.ts) takes the
// Theographic `slug` directly - `?place=<slug>` for one, `?places=<slug,...>`
// for several (which also happens to be exactly what a merged, undisambiguated
// group of same-named places needs - no information lost by merging).
const BIBLE_PLACES_ORIGIN = 'https://bibleplaces.gospelgo.org';

// Builds one place's own bio piece - feature type, Easton's blurb, aliases -
// straight from its own fields, with nothing merged or compared against any
// other place sharing the same name.
const buildPlaceBio = (fields) => {
  const subtitleParts = [];
  if (fields.featureType) {
    subtitleParts.push(fields.featureSubType ? `${fields.featureType} (${fields.featureSubType})` : fields.featureType);
  }
  if (fields.comment) subtitleParts.push(fields.comment);

  const bio = {};
  if (subtitleParts.length) bio.subtitle = subtitleParts.join(' · ');
  const text = getEastonParagraphs(fields);
  if (text.length) bio.text = text;
  const aliases = formatCommaList(fields.aliases);
  if (aliases) bio.alsoCalled = `Also called: ${aliases}`;
  return Object.keys(bio).length ? bio : null;
};

// A smaller but real share of place names are never disambiguated in the
// source data either (e.g. unrelated minor sites sharing a bare name) - see
// the matching comment in parse-theographic-people.js for why a merged group
// gets one bio per place (`bio.people`) instead of one bio intersected across
// all of them. `mapUrl` is the one exception: it's built once across the
// whole group (every merged place's slug goes into a single `?places=` link,
// see BIBLE_PLACES_ORIGIN above) since showing all of them together on one
// map is actually useful, not misleading.
const buildBio = (recordsFields) => {
  const slugs = recordsFields.map((f) => f.slug).filter(Boolean);
  let mapUrl;
  if (slugs.length === 1) {
    mapUrl = `${BIBLE_PLACES_ORIGIN}/?place=${encodeURIComponent(slugs[0])}`;
  } else if (slugs.length > 1) {
    mapUrl = `${BIBLE_PLACES_ORIGIN}/?places=${slugs.map(encodeURIComponent).join(',')}`;
  }

  if (recordsFields.length === 1) {
    const bio = buildPlaceBio(recordsFields[0]) || {};
    if (mapUrl) bio.mapUrl = mapUrl;
    return Object.keys(bio).length ? bio : null;
  }

  const people = recordsFields.map((fields) => buildPlaceBio(fields)).filter(Boolean);
  const bio = { subtitle: `${recordsFields.length} biblical places share this name` };
  if (mapUrl) bio.mapUrl = mapUrl;
  if (people.length) bio.people = people;
  return bio;
};

async function parsePlaces(bibleData) {
  console.log('Loading Theographic places.json / verses.json...');
  const [placesJson, versesJson] = await Promise.all([
    loadTheographicJson('places.json'),
    loadTheographicJson('verses.json')
  ]);

  const verseOsisMap = buildVerseOsisMap(versesJson);

  // Group by displayTitle first (see buildBio's comment above) - a chunk of
  // minor place names collide with other, unrelated places in the source
  // data, and those should merge into one topic entry rather than overwrite.
  const groups = new Map();
  let skippedNoVerses = 0;
  for (const record of placesJson) {
    const fields = record.fields || {};
    const name = fields.displayTitle || fields.kjvName;
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
        if (seenVerseIds.has(verseId)) continue; // same verse mentions >1 merged place
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

    const bio = buildBio(recordsFields);
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

  console.log(`Skipped ${skippedNoVerses} places with no resolvable verses.`);
  if (unknownBooks.size) {
    console.log('Unknown OSIS book prefixes (count):', Object.fromEntries(unknownBooks));
  }
  return result;
}

async function main() {
  console.log('Loading bible.json for exact verse positions...');
  const bibleData = await loadBibleData();

  const places = await parsePlaces(bibleData);

  const outputPath = path.join(__dirname, '..', 'data', 'theographic-places-with-references.json');
  await fs.writeFile(outputPath, JSON.stringify(places));

  const count = Object.keys(places).length;
  const totalRefs = Object.values(places)
    .reduce((sum, p) => sum + Object.values(p.references).flat().length, 0);
  console.log(`Wrote ${outputPath}`);
  console.log(`Parsed ${count} places with ${totalRefs} total verse references.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

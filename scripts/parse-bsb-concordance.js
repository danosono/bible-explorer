const fs = require('fs').promises;
const path = require('path');
const XLSX = require('xlsx');
const { BOOK_IDS, loadBibleData, getAbsoluteVerseIndex } = require('./lib/bsb-shared');

const INPUT_PATH = 'C:/Unity Projects/_BibleDatasets/Berean/bsb_concordance.xlsx';

// Words kept even though they're high-frequency - proper nouns / theological terms.
const KEEP_WORDS = new Set([
  'Lord', 'God', 'Jesus', 'Son', 'King', 'Man', 'People', 'Israel', 'Land', 'Day',
  'Men', 'House', 'Father', 'David', 'Sons', 'Hand', 'Moses', 'Judah', 'Jerusalem',
  'City', 'Earth', 'Name', 'Offering', 'Word', 'Heart', 'Egypt'
]);

// The 117 highest-frequency (>=600 occurrences) function words, minus KEEP_WORDS.
const DISCARD_WORDS = [
  'The', 'And', 'Of', 'To', 'You', 'In', 'Will', 'A', 'He', 'I', 'For', 'His', 'Is', 'Your',
  'They', 'That', 'Not', 'With', 'From', 'Him', 'Be', 'All', 'Them', 'My', 'It', 'Who', 'Have',
  'On', 'But', 'As', 'Was', 'Me', 'Are', 'So', 'Their', 'This', 'Then', 'Had', 'Said', 'When',
  'Has', 'One', 'Out', 'By', 'Do', 'Were', 'What', 'At', 'Or', 'Up', 'We', 'If', 'There', 'No',
  'Her', 'Like', 'Against', 'Because', 'May', 'Us', 'Before', 'Now', 'Into', 'Come', 'These',
  'Those', 'Our', 'Go', 'Did', 'Down', 'An', 'O', 'Am', 'Came', 'Went', 'Over', 'Its', 'Let',
  'Must', 'She', 'Made', 'Among', 'Know', 'Place', 'Been', 'Which', 'Away', 'Also', 'Put',
  'Would', 'After', 'See', 'Take', 'Every', 'Brought', 'Give', 'Own', 'Make', 'Time', 'Can',
  'Great', 'Shall', 'Says', 'About', 'Set', 'Say', 'Replied', 'Through', 'Bring', 'How', 'Sent',
  'Where', 'Two', 'Tell', 'Even', 'Saw'
];

// Lower-frequency function words in the same categories (pronouns, conjunctions,
// prepositions, auxiliary/archaic verb forms, quantifiers, spelled-out numbers),
// excluded at any frequency so the concordance stays focused on content words.
const EXTENSION_WORDS = [
  'Whom', 'Whose', 'Mine', 'Ours', 'Yours', 'Hers', 'Theirs', 'Myself', 'Yourself', 'Himself',
  'Herself', 'Itself', 'Ourselves', 'Yourselves', 'Themselves', 'Whoever', 'Whatever',
  'Whichever', 'Someone', 'Something', 'Anyone', 'Anything', 'Everyone', 'Everything',
  'Nothing', 'Nobody', 'Anybody', 'Somebody', 'Everybody',
  'Thee', 'Thou', 'Thy', 'Thine', 'Thyself', 'Ye', 'Hast', 'Hath', 'Doth', 'Dost', 'Wilt',
  'Shalt', 'Art', 'Wert', 'Wast', 'Unto',
  'Nor', 'Yet', 'Although', 'Though', 'While', 'Since', 'Unless', 'Whether', 'Therefore',
  'Thus', 'Hence', 'Whereas', 'Wherefore', 'Wherein', 'Whereby', 'Whereupon',
  'Without', 'Onto', 'Upon', 'Within', 'Beneath', 'Beside', 'Besides', 'Toward', 'Towards',
  'Underneath', 'Amid', 'Amidst', 'Across', 'Behind', 'Beyond', 'Despite', 'Except', 'Per',
  'Via', 'Round', 'Off', 'Above', 'Below', 'Between', 'During', 'Throughout', 'Near',
  'Some', 'Any', 'Each', 'Either', 'Neither', 'Both', 'None', 'Such', 'Same', 'Other',
  'Another', 'Several', 'Enough', 'Few', 'Little', 'Much', 'Many', 'Most', 'Less', 'Least',
  'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
  'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety', 'Hundred',
  'Thousand', 'First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth',
  'Ninth', 'Tenth', 'Once', 'Twice', 'Thrice',
  'Only', 'Still', 'Already', 'Ever', 'Never', 'Always', 'Often', 'Sometimes', 'Soon',
  'Quite', 'Rather', 'Very', 'Indeed', 'Perhaps', 'Else', 'Otherwise', 'Instead', 'However',
  'Moreover', 'Nevertheless', 'Nonetheless', 'Just', 'Cannot', 'Whither', 'Hither', 'Thither',
  'Yea', 'Verily'
];

const STOPWORDS = new Set([...DISCARD_WORDS, ...EXTENSION_WORDS].map((w) => w.toLowerCase()));

const unmappedBooks = new Map();

// "Gen 32:15" / "Lev_26:5" (a few rows use underscores instead of spaces) -> { bookId, chapter, verse }
function parseVerseRef(ref) {
  const raw = String(ref).trim();
  let match = raw.match(/^(.+?)\s+(\d+):(\d+)$/);
  if (!match) match = raw.replace(/_/g, ' ').match(/^(.+?)\s+(\d+):(\d+)$/);
  if (!match) return null;

  const bookLabel = match[1].trim();
  const bookId = BOOK_IDS[bookLabel];
  if (!bookId) {
    unmappedBooks.set(bookLabel, (unmappedBooks.get(bookLabel) || 0) + 1);
    return null;
  }

  return {
    bookId,
    chapter: parseInt(match[2], 10),
    verse: parseInt(match[3], 10),
    refText: raw.replace(/_/g, ' ')
  };
}

async function parseConcordance(bibleData) {
  const wb = XLSX.readFile(INPUT_PATH);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });

  const result = {};
  let currentWordData = null;
  let skippedRefs = 0;

  for (let i = 2; i < rows.length; i += 1) {
    const row = rows[i];
    const occ = row[4];

    if (occ === 0) {
      const entry = String(row[6] || '');
      const headerMatch = entry.match(/^(.+?)\s*\((\d+)\s*Occurrence/);
      if (!headerMatch) {
        currentWordData = null;
        continue;
      }

      const word = headerMatch[1].trim();
      if (!KEEP_WORDS.has(word) && STOPWORDS.has(word.toLowerCase())) {
        currentWordData = null;
        continue;
      }

      result[word] = { name: word, references: {}, books: [] };
      currentWordData = result[word];
      continue;
    }

    if (!currentWordData) continue;

    const parsed = parseVerseRef(row[7]);
    if (!parsed) {
      skippedRefs += 1;
      continue;
    }

    const absoluteVerse = getAbsoluteVerseIndex(bibleData, parsed.bookId, parsed.chapter, parsed.verse);
    if (!currentWordData.references[parsed.bookId]) {
      currentWordData.references[parsed.bookId] = [];
    }
    currentWordData.references[parsed.bookId].push({
      verse: absoluteVerse || parsed.verse,
      subtopics: [],
      refs: [parsed.refText]
    });
  }

  for (const wordData of Object.values(result)) {
    const bookIds = [];
    for (const [bookId, refs] of Object.entries(wordData.references)) {
      refs.sort((a, b) => a.verse - b.verse);
      bookIds.push(bookId);
    }
    wordData.books = bookIds;
  }

  console.log(`Skipped ${skippedRefs} unparseable verse references.`);
  return result;
}

async function main() {
  console.log('Loading bible.json for exact verse positions...');
  const bibleData = await loadBibleData();

  console.log('Parsing BSB Concordance...');
  const words = await parseConcordance(bibleData);

  const outputPath = path.join(__dirname, '..', 'data', 'bsb-concordance-with-references.json');
  // Written minified - this dataset has the most reference rows of the four
  // datasets and is eager-loaded by the browser, so size matters.
  const json = JSON.stringify(words);
  await fs.writeFile(outputPath, json);

  const wordCount = Object.keys(words).length;
  const totalRefs = Object.values(words)
    .reduce((sum, w) => sum + Object.values(w.references).flat().length, 0);
  console.log(`Wrote ${outputPath}`);
  console.log(`Parsed ${wordCount} words with ${totalRefs} total verse references.`);
  console.log(`File size: ${(Buffer.byteLength(json) / (1024 * 1024)).toFixed(2)} MB`);

  if (unmappedBooks.size) {
    console.log('\nUnknown book labels (count):');
    const sorted = Array.from(unmappedBooks.entries()).sort((a, b) => b[1] - a[1]);
    for (const [label, count] of sorted) {
      console.log(`  ${label}: ${count}`);
    }
  } else {
    console.log('No unknown book labels found.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

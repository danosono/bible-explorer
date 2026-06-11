const fs = require('fs').promises;
const path = require('path');

// Book name/abbreviation -> 3-letter ID mapping, shared by the BSB Topics and
// BSB Concordance parsers. Extends the Nave's Topics map (parse-topics.js)
// with full book names used in the Berean datasets that Nave's doesn't need.
const BOOK_IDS = {
  'Gen': 'GEN', 'Ge': 'GEN', 'Gn': 'GEN', 'Genesis': 'GEN',
  'Exodus': 'EXO', 'Exod': 'EXO', 'Ex': 'EXO', 'Exo': 'EXO',
  'Leviticus': 'LEV', 'Lev': 'LEV', 'Le': 'LEV',
  'Numbers': 'NUM', 'Num': 'NUM', 'Nu': 'NUM',
  'Deuteronomy': 'DEU', 'Deut': 'DEU', 'De': 'DEU', 'Dt': 'DEU', 'Deu': 'DEU',
  'Joshua': 'JOS', 'Josh': 'JOS', 'Jos': 'JOS',
  'Judges': 'JDG', 'Judg': 'JDG', 'Jdg': 'JDG',
  'Ruth': 'RUT', 'Ru': 'RUT', 'Rut': 'RUT',
  '1 Samuel': '1SA', '1SA': '1SA', '1 Sam': '1SA', '1Sa': '1SA',
  '2 Samuel': '2SA', '2SA': '2SA', '2 Sam': '2SA', '2Sa': '2SA',
  '1 Kings': '1KI', '1Kgs': '1KI', '1 Kgs': '1KI', '1Ki': '1KI',
  '2 Kings': '2KI', '2Kgs': '2KI', '2 Kgs': '2KI', '2Ki': '2KI',
  '1 Chronicles': '1CH', '1Chr': '1CH', '1 Chr': '1CH', '1Ch': '1CH',
  '2 Chronicles': '2CH', '2Chr': '2CH', '2 Chr': '2CH', '2Ch': '2CH',
  'Ezra': 'EZR', 'Ezr': 'EZR', 'Nehemiah': 'NEH', 'Neh': 'NEH', 'Ne': 'NEH',
  'Esther': 'EST', 'Est': 'EST',
  'Job': 'JOB',
  'Psalms': 'PSA', 'Psalm': 'PSA', 'Psa': 'PSA', 'Ps': 'PSA',
  'Proverbs': 'PRO', 'Pro': 'PRO', 'Pr': 'PRO',
  'Ecclesiastes': 'ECC', 'Eccl': 'ECC', 'Ec': 'ECC', 'Ecc': 'ECC',
  'Song of Songs': 'SNG', 'Song of Solomon': 'SNG', 'Songs': 'SNG', 'Song': 'SNG', 'So': 'SNG', 'Cant': 'SNG', 'Sos': 'SNG',
  'Isaiah': 'ISA', 'Isa': 'ISA',
  'Jeremiah': 'JER', 'Jer': 'JER',
  'Lamentations': 'LAM', 'Lam': 'LAM', 'La': 'LAM',
  'Ezekiel': 'EZK', 'Ezek': 'EZK', 'Eze': 'EZK',
  'Daniel': 'DAN', 'Dan': 'DAN', 'Da': 'DAN',
  'Hosea': 'HOS', 'Hos': 'HOS', 'Ho': 'HOS',
  'Joel': 'JOL', 'Joe': 'JOL',
  'Amos': 'AMO', 'Am': 'AMO', 'Amo': 'AMO',
  'Obadiah': 'OBA', 'Oba': 'OBA', 'Ob': 'OBA',
  'Jonah': 'JON', 'Jon': 'JON',
  'Micah': 'MIC', 'Mic': 'MIC',
  'Nahum': 'NAM', 'Nahm': 'NAM', 'Na': 'NAM', 'Nah': 'NAM',
  'Habakkuk': 'HAB', 'Hab': 'HAB',
  'Zephaniah': 'ZEP', 'Zeph': 'ZEP', 'Zep': 'ZEP',
  'Haggai': 'HAG', 'Hag': 'HAG',
  'Zechariah': 'ZEC', 'Zech': 'ZEC', 'Zec': 'ZEC',
  'Malachi': 'MAL', 'Mal': 'MAL',
  'Matthew': 'MAT', 'Matt': 'MAT', 'Mt': 'MAT', 'Mat': 'MAT',
  'Mark': 'MRK', 'Mr': 'MRK', 'Mk': 'MRK', 'Mar': 'MRK',
  'Luke': 'LUK', 'Lu': 'LUK', 'Lk': 'LUK', 'Luk': 'LUK',
  'John': 'JHN', 'Jn': 'JHN', 'Jno': 'JHN', 'Joh': 'JHN',
  'Acts': 'ACT', 'Act': 'ACT', 'Ac': 'ACT',
  'Romans': 'ROM', 'Rom': 'ROM', 'Ro': 'ROM', 'Rm': 'ROM',
  '1 Corinthians': '1CO', '1Cor': '1CO', '1 Cor': '1CO', '1 Co': '1CO', '1Co': '1CO',
  '2 Corinthians': '2CO', '2Cor': '2CO', '2 Cor': '2CO', '2 Co': '2CO', '2Co': '2CO',
  'Galatians': 'GAL', 'Gal': 'GAL', 'Ga': 'GAL',
  'Ephesians': 'EPH', 'Eph': 'EPH', 'Ep': 'EPH',
  'Philippians': 'PHP', 'Phil': 'PHP', 'Php': 'PHP',
  'Colossians': 'COL', 'Col': 'COL',
  '1 Thessalonians': '1TH', '1Thess': '1TH', '1 Thess': '1TH', '1 Th': '1TH', '1Th': '1TH',
  '2 Thessalonians': '2TH', '2Thess': '2TH', '2 Thess': '2TH', '2 Th': '2TH', '2Th': '2TH',
  '1 Timothy': '1TI', '1Tim': '1TI', '1 Tim': '1TI', '1 Ti': '1TI', '1Ti': '1TI',
  '2 Timothy': '2TI', '2Tim': '2TI', '2 Tim': '2TI', '2 Ti': '2TI', '2Ti': '2TI',
  'Titus': 'TIT', 'Tit': 'TIT', 'Tts': 'TIT',
  'Philemon': 'PHM', 'Phm': 'PHM',
  'Hebrews': 'HEB', 'Heb': 'HEB',
  'James': 'JAS', 'Jas': 'JAS', 'Jm': 'JAS', 'Jam': 'JAS',
  '1 Peter': '1PE', '1Pet': '1PE', '1 Pet': '1PE', '1 Pe': '1PE', '1Pe': '1PE',
  '2 Peter': '2PE', '2Pet': '2PE', '2 Pet': '2PE', '2 Pe': '2PE', '2Pe': '2PE',
  '1 John': '1JN', '1Jn': '1JN', '1 Jn': '1JN', '1 Jo': '1JN', '1 Joh': '1JN',
  '2 John': '2JN', '2Jn': '2JN', '2 Jn': '2JN', '2 Jo': '2JN', '2 Joh': '2JN',
  '3 John': '3JN', '3Jn': '3JN', '3 Jn': '3JN', '3 Jo': '3JN', '3 Joh': '3JN',
  'Jude': 'JUD', 'Jud': 'JUD', 'Jde': 'JUD',
  'Revelation': 'REV', 'Rev': 'REV', 'Re': 'REV'
};

// Loads data/bible.json and indexes books by ID, for exact absolute-verse-index lookups.
const loadBibleData = async () => {
  const biblePath = path.join(__dirname, '..', '..', 'data', 'bible.json');
  const raw = JSON.parse(await fs.readFile(biblePath, 'utf-8'));
  const indexed = {};
  raw.books.forEach((book) => {
    indexed[book.id] = book;
  });
  return indexed;
};

// Exact absolute verse index within a book (1-based), mirroring js/app.js's
// getAbsoluteVerseIndex but operating on data/bible.json loaded in Node.
const getAbsoluteVerseIndex = (bibleData, bookId, chapterNumber, verseNumber) => {
  const book = bibleData[bookId];
  if (!book || !Array.isArray(book.chapters) || !chapterNumber || !verseNumber) return null;
  let total = 0;
  const limit = Math.min(chapterNumber - 1, book.chapters.length);
  for (let i = 0; i < limit; i += 1) {
    const chapter = book.chapters[i];
    const count = Number(chapter.verseCount) || (Array.isArray(chapter.verses) ? chapter.verses.length : 0);
    total += count;
  }

  const chapterData = book.chapters[chapterNumber - 1];
  if (chapterData && Array.isArray(chapterData.verses)) {
    const idx = chapterData.verses.findIndex((entry) => Number(entry.n ?? entry.number) === Number(verseNumber));
    if (idx >= 0) {
      return total + idx + 1;
    }
  }

  return total + verseNumber;
};

module.exports = { BOOK_IDS, loadBibleData, getAbsoluteVerseIndex };

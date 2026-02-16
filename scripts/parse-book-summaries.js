const fs = require('fs').promises;
const path = require('path');

// Book name to ID mapping (using the 3-letter codes from books-summary.json)
const BOOK_IDS = {
  'Genesis': 'GEN', 'Exodus': 'EXO', 'Leviticus': 'LEV', 'Numbers': 'NUM', 'Deuteronomy': 'DEU',
  'Joshua': 'JOS', 'Judges': 'JDG', 'Ruth': 'RUT', '1 Samuel': '1SA', '2 Samuel': '2SA',
  '1 Kings': '1KI', '2 Kings': '2KI', '1 Chronicles': '1CH', '2 Chronicles': '2CH',
  'Ezra': 'EZR', 'Nehemiah': 'NEH', 'Esther': 'EST', 'Job': 'JOB', 'Psalms': 'PSA',
  'Proverbs': 'PRO', 'Ecclesiastes': 'ECC', 'Song of Solomon': 'SNG', 'Isaiah': 'ISA',
  'Jeremiah': 'JER', 'Lamentations': 'LAM', 'Ezekiel': 'EZK', 'Daniel': 'DAN',
  'Hosea': 'HOS', 'Joel': 'JOL', 'Amos': 'AMO', 'Obadiah': 'OBA', 'Jonah': 'JON',
  'Micah': 'MIC', 'Nahum': 'NAM', 'Habakkuk': 'HAB', 'Zephaniah': 'ZEP', 'Haggai': 'HAG',
  'Zechariah': 'ZEC', 'Malachi': 'MAL',
  'Matthew': 'MAT', 'Mark': 'MRK', 'Luke': 'LUK', 'John': 'JHN', 'Acts': 'ACT',
  'Romans': 'ROM', '1 Corinthians': '1CO', '2 Corinthians': '2CO', 'Galatians': 'GAL',
  'Ephesians': 'EPH', 'Philippians': 'PHP', 'Colossians': 'COL', '1 Thessalonians': '1TH',
  '2 Thessalonians': '2TH', '1 Timothy': '1TI', '2 Timothy': '2TI', 'Titus': 'TIT',
  'Philemon': 'PHM', 'Hebrews': 'HEB', 'James': 'JAS', '1 Peter': '1PE', '2 Peter': '2PE',
  '1 John': '1JN', '2 John': '2JN', '3 John': '3JN', 'Jude': 'JUD', 'Revelation': 'REV'
};

async function parseSummaries() {
  const inputPath = 'C:\\Unity Projects\\_BibleDatasets\\book-summaries.txt';
  const outputPath = path.join(__dirname, '..', 'data', 'book-summaries.json');
  
  const content = await fs.readFile(inputPath, 'utf-8');
  
  // Split on lines that start with a book name followed by " — "
  const regex = /^([^\n]+?)\s*—\s*(.+?)(?=\n\n[^\n]+?\s*—|$)/gms;
  const summaries = {};
  let match;
  
  while ((match = regex.exec(content)) !== null) {
    const bookName = match[1].trim();
    const summary = match[2].trim().replace(/\s+/g, ' ');
    const bookId = BOOK_IDS[bookName];
    
    if (bookId) {
      summaries[bookId] = {
        name: bookName,
        summary: summary
      };
    } else {
      console.warn(`No book ID found for: ${bookName}`);
    }
  }
  
  await fs.writeFile(outputPath, JSON.stringify(summaries, null, 2));
  console.log(`✓ Wrote ${Object.keys(summaries).length} book summaries to ${outputPath}`);
}

parseSummaries().catch(console.error);

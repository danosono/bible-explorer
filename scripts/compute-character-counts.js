const fs = require('fs').promises;
const path = require('path');

async function main() {
  const inputPath = path.join(__dirname, '..', 'data', 'bible.json');
  const outputPath = path.join(__dirname, '..', 'data', 'book-character-counts.json');

  const bible = JSON.parse(await fs.readFile(inputPath, 'utf-8'));

  const books = {};
  for (const book of bible.books) {
    let total = 0;
    for (const chapter of book.chapters) {
      for (const verse of chapter.verses) {
        total += (verse.text || '').length;
      }
    }
    books[book.id] = total;
  }

  const output = {
    metadata: {
      description: "Character count per book - used for proportional Overview sizing",
      formula: "value = characterCount (relative weight for treemap row height)"
    },
    books
  };

  await fs.writeFile(outputPath, JSON.stringify(output, null, 2));

  console.log(`Wrote ${outputPath}`);
  const sorted = Object.entries(books).sort((a, b) => b[1] - a[1]);
  console.log(`Largest: ${sorted[0][0]} = ${sorted[0][1]}`);
  console.log(`Smallest: ${sorted[sorted.length - 1][0]} = ${sorted[sorted.length - 1][1]}`);
  console.log(`Total: ${Object.values(books).reduce((a, b) => a + b, 0)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

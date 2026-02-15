const treemapEl = document.getElementById("treemap");
const stateSlider = document.querySelector(".state-slider");
const statePill = document.querySelector(".control-pill");
const topicInput = document.getElementById("topic-input");
const topicAction = document.getElementById("topic-action");

// Global state for topics
let topicsData = {};
let verseCounts = {}; // Book verse counts for percentage calculation
let bibleData = {}; // Bible text data
let selectedTopic = null;
let booksData = [];
const DEFAULT_TOPIC = "birth of Jesus Christ";
const topicsIndex = new Map();
let allTopicNames = [];
const MAX_TOPIC_OPTIONS = 200;

// Verse text caching and tooltip management
let verseTextCache = {};
let currentTooltip = null;

const getVerseText = (bookId, verseNumber) => {
  if (!bibleData[bookId]) return null;
  const cacheKey = `${bookId}-${verseNumber}`;
  if (verseTextCache[cacheKey]) {
    return verseTextCache[cacheKey];
  }
  
  const book = bibleData[bookId];
  let currentVerse = 0;
  for (const chapter of book.chapters) {
    for (const verse of chapter.verses) {
      currentVerse++;
      if (currentVerse === verseNumber) {
        verseTextCache[cacheKey] = verse.text;
        return verse.text;
      }
    }
  }
  return null;
};

const showTooltip = (e, refText, subtopicText, bookId, verseNumber) => {
  // Remove old tooltip
  if (currentTooltip) currentTooltip.remove();
  
  // Create tooltip element
  const tooltip = document.createElement('tip');
  
  // Build text
  let text = refText;
  if (subtopicText) {
    text += ` (${subtopicText})`;
  }
  const verseText = getVerseText(bookId, verseNumber);
  if (verseText) {
    text += `\n${verseText}`;
  }
  
  tooltip.textContent = text;
  document.body.appendChild(tooltip);
  currentTooltip = tooltip;
  
  // Position tooltip
  requestAnimationFrame(() => {
    const rect = e.target.getBoundingClientRect();
    let x = rect.left;
    let y = rect.bottom + 8;
    const tw = tooltip.offsetWidth;
    const th = tooltip.offsetHeight;
    
    // Keep on screen
    if (x + tw > window.innerWidth) x = window.innerWidth - tw - 10;
    if (y + th > window.innerHeight) y = rect.top - th - 8;
    if (x < 0) x = 10;
    if (y < 0) y = 10;
    
    tooltip.style.left = x + 'px';
    tooltip.style.top = y + 'px';
    tooltip.classList.add('show');
  });
};

const hideTooltip = () => {
  if (currentTooltip) {
    currentTooltip.classList.remove('show');
    setTimeout(() => {
      if (currentTooltip) currentTooltip.remove();
      currentTooltip = null;
    }, 150);
  }
};

const normalizeTopicKey = (value) => String(value || "").trim().toLowerCase();

const resolveTopicKey = (value) => {
  const normalized = normalizeTopicKey(value);
  return topicsIndex.get(normalized) || null;
};

const getCurrentState = () => Number(stateSlider?.value) || 1;

const updateTopicActionState = (stateValue = getCurrentState()) => {
  if (!topicAction) return;
  const isOverview = stateValue === 1;
  topicAction.textContent = isOverview ? "Reset Topic" : "Clear Topic";
  topicAction.disabled = !isOverview && !selectedTopic;
};

const applyTopicSelection = (topicName, options = {}) => {
  const { commit = false } = options;
  const resolved = resolveTopicKey(topicName);
  const normalizedInput = normalizeTopicKey(topicName);
  const isExactMatch = resolved && normalizeTopicKey(resolved) === normalizedInput;

  if (!normalizedInput) {
    selectedTopic = null;
  } else if (commit || isExactMatch) {
    selectedTopic = resolved && topicsData[resolved] ? resolved : null;
  }

  if (topicInput && commit) {
    topicInput.value = selectedTopic || "";
  }

  renderTreemap(booksData, selectedTopic);
  updateTopicActionState();
};

const getTopicOptions = (filterValue) => {
  const normalized = normalizeTopicKey(filterValue);
  if (!normalized) {
    return allTopicNames.slice(0, MAX_TOPIC_OPTIONS);
  }
  const startsWithMatches = [];
  const containsMatches = [];
  for (const name of allTopicNames) {
    const candidate = normalizeTopicKey(name);
    if (candidate.startsWith(normalized)) {
      startsWithMatches.push(name);
    } else if (candidate.includes(normalized)) {
      containsMatches.push(name);
    }
    if (startsWithMatches.length >= MAX_TOPIC_OPTIONS) break;
  }
  if (startsWithMatches.length >= MAX_TOPIC_OPTIONS) {
    return startsWithMatches.slice(0, MAX_TOPIC_OPTIONS);
  }
  const combined = startsWithMatches.concat(containsMatches);
  if (combined.length > MAX_TOPIC_OPTIONS) {
    return combined.slice(0, MAX_TOPIC_OPTIONS);
  }
  return combined;
};

const updateTopicOptions = (filterValue) => {
  if (!topicInput) return;
  const listId = "topic-list";
  let list = document.getElementById(listId);
  if (!list) {
    list = document.createElement("datalist");
    list.id = listId;
    topicInput.parentElement.appendChild(list);
    topicInput.setAttribute("list", listId);
  }
  list.innerHTML = "";
  const fragment = document.createDocumentFragment();
  getTopicOptions(filterValue).forEach((topic) => {
    const option = document.createElement("option");
    option.value = String(topic);
    fragment.appendChild(option);
  });
  list.appendChild(fragment);
};

const stateNames = {
  1: "Bible",
  2: "Book",
  3: "Verse"
};

if (stateSlider && statePill) {
  const updateState = () => {
    const value = Number(stateSlider.value) || 1;
    statePill.innerHTML = "<strong>State</strong> " + stateNames[value];
    document.body.dataset.state = String(value);
    updateTopicActionState(value);
  };
  stateSlider.addEventListener("input", updateState);
  updateState();
}

const fallbackBooks = [
  { id: "GEN", name: "Genesis", verseCount: 1533 },
  { id: "EXO", name: "Exodus", verseCount: 1213 },
  { id: "LEV", name: "Leviticus", verseCount: 859 },
  { id: "NUM", name: "Numbers", verseCount: 1288 },
  { id: "DEU", name: "Deuteronomy", verseCount: 959 },
  { id: "JOS", name: "Joshua", verseCount: 658 },
  { id: "JDG", name: "Judges", verseCount: 618 },
  { id: "RUT", name: "Ruth", verseCount: 85 },
  { id: "PSA", name: "Psalms", verseCount: 2461 },
  { id: "ISA", name: "Isaiah", verseCount: 1292 }
];

const BOOK_ORDER = [
  "GEN",
  "EXO",
  "LEV",
  "NUM",
  "DEU",
  "JOS",
  "JDG",
  "RUT",
  "1SA",
  "2SA",
  "1KI",
  "2KI",
  "1CH",
  "2CH",
  "EZR",
  "NEH",
  "EST",
  "JOB",
  "PSA",
  "PRO",
  "ECC",
  "SNG",
  "ISA",
  "JER",
  "LAM",
  "EZK",
  "DAN",
  "HOS",
  "JOL",
  "AMO",
  "OBA",
  "JON",
  "MIC",
  "NAM",
  "HAB",
  "ZEP",
  "HAG",
  "ZEC",
  "MAL",
  "MAT",
  "MRK",
  "LUK",
  "JHN",
  "ACT",
  "ROM",
  "1CO",
  "2CO",
  "GAL",
  "EPH",
  "PHP",
  "COL",
  "1TH",
  "2TH",
  "1TI",
  "2TI",
  "TIT",
  "PHM",
  "HEB",
  "JAS",
  "1PE",
  "2PE",
  "1JN",
  "2JN",
  "3JN",
  "JUD",
  "REV"
];

const BOOK_NAMES = {
  GEN: "Genesis",
  EXO: "Exodus",
  LEV: "Leviticus",
  NUM: "Numbers",
  DEU: "Deuteronomy",
  JOS: "Joshua",
  JDG: "Judges",
  RUT: "Ruth",
  "1SA": "1 Samuel",
  "2SA": "2 Samuel",
  "1KI": "1 Kings",
  "2KI": "2 Kings",
  "1CH": "1 Chronicles",
  "2CH": "2 Chronicles",
  EZR: "Ezra",
  NEH: "Nehemiah",
  EST: "Esther",
  JOB: "Job",
  PSA: "Psalms",
  PRO: "Proverbs",
  ECC: "Ecclesiastes",
  SNG: "Song of Songs",
  ISA: "Isaiah",
  JER: "Jeremiah",
  LAM: "Lamentations",
  EZK: "Ezekiel",
  DAN: "Daniel",
  HOS: "Hosea",
  JOL: "Joel",
  AMO: "Amos",
  OBA: "Obadiah",
  JON: "Jonah",
  MIC: "Micah",
  NAM: "Nahum",
  HAB: "Habakkuk",
  ZEP: "Zephaniah",
  HAG: "Haggai",
  ZEC: "Zechariah",
  MAL: "Malachi",
  MAT: "Matthew",
  MRK: "Mark",
  LUK: "Luke",
  JHN: "John",
  ACT: "Acts",
  ROM: "Romans",
  "1CO": "1 Corinthians",
  "2CO": "2 Corinthians",
  GAL: "Galatians",
  EPH: "Ephesians",
  PHP: "Philippians",
  COL: "Colossians",
  "1TH": "1 Thessalonians",
  "2TH": "2 Thessalonians",
  "1TI": "1 Timothy",
  "2TI": "2 Timothy",
  TIT: "Titus",
  PHM: "Philemon",
  HEB: "Hebrews",
  JAS: "James",
  "1PE": "1 Peter",
  "2PE": "2 Peter",
  "1JN": "1 John",
  "2JN": "2 John",
  "3JN": "3 John",
  JUD: "Jude",
  REV: "Revelation"
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const BOOK_GENRES = {
  // Law (Torah/Pentateuch)
  GEN: "law",
  EXO: "law",
  LEV: "law",
  NUM: "law",
  DEU: "law",
  // History
  JOS: "history",
  JDG: "history",
  RUT: "history",
  "1SA": "history",
  "2SA": "history",
  "1KI": "history",
  "2KI": "history",
  "1CH": "history",
  "2CH": "history",
  EZR: "history",
  NEH: "history",
  EST: "history",
  // Poetry & Wisdom
  JOB: "poetry",
  PSA: "poetry",
  PRO: "poetry",
  ECC: "poetry",
  SNG: "poetry",
  // Prophecy
  ISA: "prophecy",
  JER: "prophecy",
  LAM: "prophecy",
  EZK: "prophecy",
  DAN: "prophecy",
  HOS: "prophecy",
  JOL: "prophecy",
  AMO: "prophecy",
  OBA: "prophecy",
  JON: "prophecy",
  MIC: "prophecy",
  NAM: "prophecy",
  HAB: "prophecy",
  ZEP: "prophecy",
  HAG: "prophecy",
  ZEC: "prophecy",
  MAL: "prophecy",
  // Gospels
  MAT: "gospel",
  MRK: "gospel",
  LUK: "gospel",
  JHN: "gospel",
  // Epistles
  ACT: "epistle",
  ROM: "epistle",
  "1CO": "epistle",
  "2CO": "epistle",
  GAL: "epistle",
  EPH: "epistle",
  PHP: "epistle",
  COL: "epistle",
  "1TH": "epistle",
  "2TH": "epistle",
  "1TI": "epistle",
  "2TI": "epistle",
  TIT: "epistle",
  PHM: "epistle",
  HEB: "epistle",
  JAS: "epistle",
  "1PE": "epistle",
  "2PE": "epistle",
  "1JN": "epistle",
  "2JN": "epistle",
  "3JN": "epistle",
  JUD: "epistle",
  // Apocalyptic
  REV: "apocalyptic"
};

const GENRE_LABELS = {
  law: "Law",
  history: "History",
  poetry: "Poetry & Wisdom",
  prophecy: "Prophecy",
  gospel: "Gospels",
  epistle: "Epistles",
  apocalyptic: "Apocalyptic"
};

const buildItems = (books) => {
  const orderIndex = new Map(BOOK_ORDER.map((id, index) => [id, index]));
  const items = books
    .map((book, index) => ({
      ...book,
      value: Math.max(1, Number(book.verseCount) || 1),
      displayName: BOOK_NAMES[book.id] || book.name || book.id,
      order: orderIndex.has(book.id) ? orderIndex.get(book.id) : BOOK_ORDER.length + index,
      isSeparator: false,
      genre: BOOK_GENRES[book.id] || "history"
    }))
    .sort((a, b) => a.order - b.order);
  
  const malIndex = items.findIndex(item => item.id === "MAL");
  if (malIndex !== -1) {
    items.splice(malIndex + 1, 0, {
      id: "SEPARATOR",
      displayName: "0 AD",
      value: 30,
      verseCount: 30,
      isSeparator: true,
      order: items[malIndex].order + 0.5
    });
  }
  
  return items;
};

const normalizeAreas = (items, width, height) => {
  const total = items.reduce((sum, item) => sum + item.value, 0) || 1;
  const area = width * height;
  items.forEach((item) => {
    item.area = (item.value / total) * area;
  });
};

const worst = (row, side) => {
  if (!row.length) return Number.POSITIVE_INFINITY;
  const sum = row.reduce((acc, item) => acc + item.area, 0);
  const max = Math.max(...row.map((item) => item.area));
  const min = Math.min(...row.map((item) => item.area));
  const sideSquared = side * side;
  return Math.max((sideSquared * max) / (sum * sum), (sum * sum) / (sideSquared * min));
};

const layoutRow = (row, rect) => {
  const rowArea = row.reduce((sum, item) => sum + item.area, 0);
  if (rect.w >= rect.h) {
    const rowHeight = rowArea / rect.w;
    let offsetX = rect.x;
    row.forEach((item) => {
      const itemWidth = item.area / rowHeight;
      item.x = offsetX;
      item.y = rect.y;
      item.w = itemWidth;
      item.h = rowHeight;
      offsetX += itemWidth;
    });
    rect.y += rowHeight;
    rect.h -= rowHeight;
  } else {
    const rowWidth = rowArea / rect.h;
    let offsetY = rect.y;
    row.forEach((item) => {
      const itemHeight = item.area / rowWidth;
      item.x = rect.x;
      item.y = offsetY;
      item.w = rowWidth;
      item.h = itemHeight;
      offsetY += itemHeight;
    });
    rect.x += rowWidth;
    rect.w -= rowWidth;
  }
};

const squarify = (items, width, height) => {
  const rect = { x: 0, y: 0, w: width, h: height };
  const remaining = items.slice();
  let row = [];

  while (remaining.length) {
    const item = remaining[0];
    const side = Math.min(rect.w, rect.h);

    if (row.length === 0 || worst(row, side) >= worst(row.concat(item), side)) {
      row.push(item);
      remaining.shift();
    } else {
      layoutRow(row, rect);
      row = [];
    }
  }

  if (row.length) {
    layoutRow(row, rect);
  }

  return items;
};

const enforceAspectRatios = (items, width, height) => {
  const cols = 14;
  const colWidth = width / cols;
  const minHeight = 110; // Minimum height to show 3 pin lines
  const booksPerCol = Math.ceil(items.length / cols);
  
  let columnItems = Array.from({ length: cols }, () => []);
  let currentCol = 0;

  items.forEach((item, index) => {
    columnItems[currentCol].push(item);
    if ((index + 1) % booksPerCol === 0 && currentCol < cols - 1) {
      currentCol++;
    }
  });

  // First pass: calculate heights with minimums
  let maxColumnHeight = 0;
  columnItems.forEach((column) => {
    if (column.length === 0) return;
    const columnValue = column.reduce((sum, item) => sum + item.value, 0);
    let totalHeight = 0;
    
    column.forEach((item) => {
      const heightProportion = item.value / columnValue;
      const proportionalHeight = height * heightProportion;
      const itemHeight = Math.max(minHeight, proportionalHeight);
      totalHeight += itemHeight;
    });
    
    maxColumnHeight = Math.max(maxColumnHeight, totalHeight);
  });
  
  // Scale factor if columns exceed available height
  const scaleFactor = maxColumnHeight > height ? height / maxColumnHeight : 1;

  // Second pass: apply scaled heights
  columnItems.forEach((column, colIndex) => {
    if (column.length === 0) return;
    const x = colIndex * colWidth;
    const columnValue = column.reduce((sum, item) => sum + item.value, 0);
    let y = 0;

    column.forEach((item) => {
      const heightProportion = item.value / columnValue;
      const proportionalHeight = height * heightProportion;
      const itemHeight = Math.max(minHeight, proportionalHeight) * scaleFactor;
      item.w = colWidth;
      item.h = itemHeight;
      item.x = x;
      item.y = y;
      item.colIndex = colIndex;
      y += itemHeight;
    });
  });
};

const renderTreemap = (books, topic = null) => {
  if (!treemapEl) return;
  const rect = treemapEl.getBoundingClientRect();
  const width = Math.max(rect.width, 320);
  const height = Math.max(rect.height, 320);

  const items = buildItems(books);
  normalizeAreas(items, width, height);
  squarify(items, width, height);
  enforceAspectRatios(items, width, height);

  // Get topic data if selected
  const topicData = topic && topicsData[topic] ? topicsData[topic] : null;

  treemapEl.innerHTML = "";
  const fragment = document.createDocumentFragment();

  items.forEach((item) => {
    const tile = document.createElement("div");
    tile.className = "treemap-item";
    tile.style.left = item.x + "px";
    tile.style.top = item.y + "px";
    tile.style.width = Math.max(0, item.w) + "px";
    tile.style.height = Math.max(0, item.h) + "px";
    tile.title = item.displayName;
    tile.dataset.row = item.rowIndex || 0;

    const card = document.createElement("article");
    card.className = item.isSeparator ? "card card--separator" : "card card--abstract";
    if (!item.isSeparator && item.genre) {
      card.setAttribute("data-genre", item.genre);
      
      // Add hover effects to highlight corresponding legend item
      tile.addEventListener("mouseenter", () => {
        const legendItem = document.querySelector(`.legend-genre[data-genre="${item.genre}"]`);
        if (legendItem) {
          legendItem.classList.add("active");
        }
      });
      
      tile.addEventListener("mouseleave", () => {
        const legendItem = document.querySelector(`.legend-genre[data-genre="${item.genre}"]`);
        if (legendItem) {
          legendItem.classList.remove("active");
        }
      });
    }

    const titleBar = document.createElement("div");
    titleBar.className = "card-title-bar";
    titleBar.textContent = item.displayName;

    card.appendChild(titleBar);

    if (item.isSeparator) {
      const separatorText = document.createElement("div");
      separatorText.className = "separator-text";
      separatorText.textContent = "Jesus Christ born in Bethlehem";
      card.appendChild(separatorText);
    } else {
      const lines = document.createElement("div");
      lines.className = "pin-lines";
      
      // Render lines based on topic data or fallback to placeholder lines
      if (topicData && topicData.references[item.id]) {
        // Render real lines at verse position percentages
        const verseEntries = topicData.references[item.id];
        const totalVerses = verseCounts[item.id] || 1;
        
        // Group verses by proximity (within 2% are considered overlapping)
        const verseGroups = [];
        const OVERLAP_THRESHOLD = 2; // percentage points
        
        const versePositions = verseEntries.map(entry => ({
          verse: entry.verse,
          percentage: (entry.verse / totalVerses) * 100,
          subtopics: Array.isArray(entry.subtopics) ? entry.subtopics : [],
          refs: Array.isArray(entry.refs) ? entry.refs : []
        }));
        
        versePositions.forEach((vp) => {
          let foundGroup = false;
          for (const group of verseGroups) {
            const avgPos = group.reduce((sum, v) => sum + v.percentage, 0) / group.length;
            if (Math.abs(vp.percentage - avgPos) <= OVERLAP_THRESHOLD) {
              group.push(vp);
              foundGroup = true;
              break;
            }
          }
          if (!foundGroup) {
            verseGroups.push([vp]);
          }
        });
        
        // Render lines with staggering for overlapping verses
        verseGroups.forEach((group) => {
          const groupAvg = group.reduce((sum, v) => sum + v.percentage, 0) / group.length;

          group.forEach((vp, index) => {
            const lineEl = document.createElement("div");
            lineEl.className = "pin-line";
            lineEl.style.position = "absolute";
            lineEl.style.top = `${vp.percentage}%`;
            
            // Stagger overlapping lines horizontally
            if (group.length > 1) {
              const totalWidth = 100;
              const individualisedWidth = totalWidth / group.length;
              lineEl.style.left = `${(index * individualisedWidth)}%`;
              lineEl.style.width = `${individualisedWidth}%`;
            }
            
            // Create tooltip data (verse text loaded only when shown)
            const refText = (vp.refs && vp.refs[0]) ? vp.refs[0] : `Verse ${vp.verse}`;
            const subtopicText = (vp.subtopics && vp.subtopics.length > 0) ? vp.subtopics.join("; ") : "";
            
            lineEl.addEventListener('mouseenter', (e) => {
              showTooltip(e, refText, subtopicText, item.id, vp.verse);
            });
            lineEl.addEventListener('mouseleave', hideTooltip);
            lineEl.dataset.verses = refText;
            lineEl.dataset.subtopics = subtopicText;
            lineEl.dataset.bookId = item.id;
            
            // Click handler to show verse modal
            lineEl.style.cursor = "pointer";
            lineEl.addEventListener("click", (e) => {
              e.stopPropagation();
              showVerseModal(item.id, item.displayName, versePositions, topicData.name);
            });
            
            lines.appendChild(lineEl);
          });
        });
        
        // Show count of verses
        const badge = document.createElement("div");
        badge.className = "topic-badge";
        badge.textContent = verseEntries.length > 1 ? `${verseEntries.length} verses` : "1 verse";
        badge.title = topicData.name;
        lines.appendChild(badge);
        
        // Add expand button
        const expandBtn = document.createElement("button");
        expandBtn.className = "expand-verses-btn";
        expandBtn.innerHTML = "⊕";
        expandBtn.title = "View all verses";
        expandBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          showVerseModal(item.id, item.displayName, versePositions, topicData.name);
        });
        tile.appendChild(expandBtn);
      } else {
        // No topic selected: keep the panel clean
      }
      
      card.appendChild(lines);
    }
    tile.appendChild(card);
    fragment.appendChild(tile);
  });

  treemapEl.appendChild(fragment);
};

const loadBooks = async () => {
  try {
    const response = await fetch("data/books-summary.json", { cache: "no-store" });
    if (!response.ok) throw new Error("Missing data");
    const data = await response.json();
    if (!data || !Array.isArray(data.books) || data.books.length === 0) {
      throw new Error("No books");
    }
    return data.books;
  } catch (error) {
    return fallbackBooks;
  }
};

const loadVerseCounts = async () => {
  try {
    const response = await fetch("data/book-verse-counts.json", { cache: "no-store" });
    if (!response.ok) throw new Error("Missing verse counts");
    const data = await response.json();
    if (!data || !data.books) throw new Error("Invalid verse counts data");
    return data.books;
  } catch (error) {
    console.warn("Failed to load verse counts");
    return {};
  }
};

const loadBible = async () => {
  try {
    const response = await fetch("data/bible.json", { cache: "no-store" });
    if (!response.ok) throw new Error("Missing bible data");
    const data = await response.json();
    if (!data || !data.books) throw new Error("Invalid bible data");
    // Index by book ID for quick lookup
    const indexed = {};
    data.books.forEach((book) => {
      indexed[book.id] = book;
    });
    return indexed;
  } catch (error) {
    console.warn("Failed to load bible text data");
    return {};
  }
};

const boot = async () => {
  if (!treemapEl) return;
  booksData = await loadBooks();
  verseCounts = await loadVerseCounts();
  bibleData = await loadBible();
  
  if (topicInput) {
    await loadTopics();
    
    // Listen for topic selection changes
    topicInput.addEventListener("change", (e) => {
      applyTopicSelection(e.target.value, { commit: true });
    });
    
    // Also listen for input changes (for autocomplete)
    topicInput.addEventListener("input", (e) => {
      updateTopicOptions(e.target.value);
      applyTopicSelection(e.target.value, { commit: false });
    });
  }

  if (topicAction) {
    topicAction.addEventListener("click", () => {
      const stateValue = getCurrentState();
      if (stateValue === 1) {
        applyTopicSelection(DEFAULT_TOPIC, { commit: true });
      } else {
        applyTopicSelection(null, { commit: true });
      }
    });
  }
  
  renderTreemap(booksData, selectedTopic);
  attachGenreLegend();

  const observer = new ResizeObserver(() => {
    renderTreemap(booksData, selectedTopic);
  });
  observer.observe(treemapEl);
};

const showVerseModal = (bookId, bookName, versePositions, topicName) => {
  // Create modal overlay
  const modal = document.createElement("div");
  modal.className = "verse-modal-overlay";
  
  const modalContent = document.createElement("div");
  modalContent.className = "verse-modal";
  
  const header = document.createElement("div");
  header.className = "verse-modal-header";
  header.innerHTML = `<h3>${bookName}</h3><p>${topicName}</p>`;
  
  const closeBtn = document.createElement("button");
  closeBtn.className = "verse-modal-close";
  closeBtn.innerHTML = "✕";
  closeBtn.addEventListener("click", () => modal.remove());
  header.appendChild(closeBtn);
  
  const content = document.createElement("div");
  content.className = "verse-modal-content";
  
  // Create visual representation with separated lines
  const visualization = document.createElement("div");
  visualization.className = "verse-visualization";
  
  versePositions.forEach((vp) => {
    const verseItem = document.createElement("div");
    verseItem.className = "verse-item";
    
    const line = document.createElement("div");
    line.className = "verse-line";
    line.style.top = `${vp.percentage}%`;
    const subtopicText = (vp.subtopics || []).join("; ");
    const refText = (vp.refs || []).join(", ") || `Verse ${vp.verse}`;
    
    line.addEventListener('mouseenter', (e) => {
      showTooltip(e, refText, subtopicText, bookId, vp.verse);
    });
    line.addEventListener('mouseleave', hideTooltip);
    line.style.cursor = "pointer";
    line.addEventListener("click", () => {
      console.log(`Clicked verse ${refText} - navigate to State 3`);
      modal.remove();
      // TODO: Navigate to state 3
    });
    
    const label = document.createElement("span");
    label.className = "verse-label";
    label.textContent = (vp.refs && vp.refs[0]) ? vp.refs[0] : `V. ${vp.verse}`;
    
    verseItem.appendChild(line);
    verseItem.appendChild(label);
    visualization.appendChild(verseItem);
  });
  
  content.appendChild(visualization);
  
  // Verse list
  const list = document.createElement("div");
  list.className = "verse-list";
  
  versePositions.forEach((vp) => {
    const item = document.createElement("div");
    item.className = "verse-list-item";
    const subtopicText = (vp.subtopics || []).join("; ");
    const refText = (vp.refs || []).join(", ") || `Verse ${vp.verse}`;
    item.innerHTML = `<strong>${refText}</strong>`;
    if (subtopicText) {
      const detail = document.createElement("span");
      detail.className = "verse-subtopic";
      detail.textContent = subtopicText;
      item.appendChild(detail);
    }
    item.style.cursor = "pointer";
    item.addEventListener("click", () => {
      console.log(`Clicked verse ${vp.verse} - navigate to State 3`);
      modal.remove();
      // TODO: Navigate to state 3
    });
    list.appendChild(item);
  });
  
  content.appendChild(list);
  
  const footer = document.createElement("div");
  footer.className = "verse-modal-footer";
  const state3Btn = document.createElement("button");
  state3Btn.className = "state3-nav-btn";
  state3Btn.textContent = "View Full Verse Text";
  state3Btn.addEventListener("click", () => {
    console.log(`Navigate to State 3 for ${bookName}`);
    modal.remove();
    // TODO: Implement State 3 navigation with selected verse
  });
  footer.appendChild(state3Btn);
  
  modalContent.appendChild(header);
  modalContent.appendChild(content);
  modalContent.appendChild(footer);
  modal.appendChild(modalContent);
  
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.remove();
  });
  
  document.body.appendChild(modal);
};

boot();

const loadTopics = async () => {
  try {
    // Load topics with verse references
    const response = await fetch("data/topics-with-references.json", { cache: "no-store" });
    if (!response.ok) throw new Error("Missing topics data");
    topicsData = await response.json();
    if (!topicsData || Object.keys(topicsData).length === 0) throw new Error("No topics");

    const topicNames = Object.keys(topicsData);
    topicsIndex.clear();
    topicNames.forEach((name) => {
      topicsIndex.set(normalizeTopicKey(name), name);
    });
    allTopicNames = topicNames;
    updateTopicOptions("");
  } catch (error) {
    console.warn("Failed to load topics data, using fallback");
    const fallbackTopics = ["angels", "birth of Jesus Christ", "crucifixion of Jesus Christ", "demons", "appearance of Jesus", "paradise", "resurrection", "Son of man", "transfiguration"];
    topicsIndex.clear();
    fallbackTopics.forEach((name) => {
      topicsIndex.set(normalizeTopicKey(name), name);
    });
    allTopicNames = fallbackTopics;
    updateTopicOptions("");
  }
};

const attachGenreLegend = () => {
  const legendEl = document.getElementById("genre-legend");
  if (!legendEl) return;
  
  legendEl.innerHTML = "";
  const genres = ["law", "history", "poetry", "prophecy", "gospel", "epistle", "apocalyptic"];
  
  genres.forEach((genre) => {
    const item = document.createElement("span");
    item.className = "legend-item legend-genre";
    item.setAttribute("data-genre", genre);
    
    const colorBar = document.createElement("span");
    colorBar.className = "legend-color-bar";
    colorBar.style.borderColor = `var(--genre-${genre})`;
    
    const label = document.createElement("span");
    label.textContent = GENRE_LABELS[genre];
    
    item.appendChild(colorBar);
    item.appendChild(label);
    legendEl.appendChild(item);
  });
};

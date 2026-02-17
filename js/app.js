const treemapEl = document.getElementById("treemap");
const stateSlider = document.querySelector(".state-slider");
const statePill = document.querySelector(".control-pill");
const topicInput = document.getElementById("topic-input");
const topicAction = document.getElementById("topic-action");
const currentTopicEl = document.getElementById("current-topic");

// Global state for topics
let topicsData = {};
let verseCounts = {}; // Book verse counts for percentage calculation
let bibleData = {}; // Bible text data
let bookSummaries = {}; // Book summaries
let selectedTopic = null;
let booksData = [];
let selectedBookId = null;
const DEFAULT_TOPIC = "life";
const STORED_TOPIC_KEY = "bibleExplorerTopic";
const topicsIndex = new Map();
let allTopicNames = [];
const MAX_TOPIC_OPTIONS = 200;

// Verse text caching and tooltip management
let verseTextCache = {};
let currentTooltip = null;

const getVerseText = (bookId, chapter, verse) => {
  if (!bibleData[bookId]) return null;
  const cacheKey = `${bookId}-${chapter}-${verse}`;
  if (verseTextCache[cacheKey]) {
    return verseTextCache[cacheKey];
  }
  
  const book = bibleData[bookId];
  if (!book.chapters || !book.chapters[chapter - 1]) return null;
  
  const chapterData = book.chapters[chapter - 1];
  if (!chapterData.verses || !chapterData.verses[verse - 1]) return null;
  
  const verseText = chapterData.verses[verse - 1].text;
  verseTextCache[cacheKey] = verseText;
  return verseText;
};

const positionTooltip = (tooltip, e) => {
  let x = e.clientX + 20;
  let y = e.clientY + 20;
  const tw = tooltip.offsetWidth;
  const th = tooltip.offsetHeight;

  // Keep on screen
  if (x + tw > window.innerWidth) x = e.clientX - tw - 20;
  if (y + th > window.innerHeight) y = e.clientY - th - 20;
  if (x < 0) x = 10;
  if (y < 0) y = 10;

  tooltip.style.left = x + 'px';
  tooltip.style.top = y + 'px';
  tooltip.classList.add('show');
};

const updateTooltipPosition = (e) => {
  if (!currentTooltip) return;
  positionTooltip(currentTooltip, e);
};

const showTooltip = (e, refText, subtopicText, bookId, verseNumber) => {
  // Build text
  let text = refText;
  if (subtopicText) {
    text += ` (${subtopicText})`;
  }

  // Parse refText to extract chapter and verse (e.g., "Acts 15:16")
  const match = refText.match(/(\d+):(\d+)/);
  if (match) {
    const chapter = parseInt(match[1], 10);
    const verse = parseInt(match[2], 10);
    const verseText = getVerseText(bookId, chapter, verse);
    if (verseText) {
      text += `\n${verseText}`;
    }
  }

  if (currentTooltip && currentTooltip.dataset.content === text) {
    positionTooltip(currentTooltip, e);
    return;
  }

  if (currentTooltip) currentTooltip.remove();

  // Create tooltip element
  const tooltip = document.createElement('tip');
  tooltip.textContent = text;
  tooltip.dataset.content = text;
  document.body.appendChild(tooltip);
  currentTooltip = tooltip;

  requestAnimationFrame(() => {
    positionTooltip(tooltip, e);
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

const updateStateUI = (stateValue = getCurrentState()) => {
  if (statePill) {
    statePill.innerHTML = "<strong>State</strong> " + stateNames[stateValue];
  }
  document.body.dataset.state = String(stateValue);
  updateTopicActionState(stateValue);
};

const renderCurrentState = () => {
  const stateValue = getCurrentState();
  if (stateValue === 1) {
    renderTreemap(booksData, selectedTopic);
    return;
  }
  if (stateValue === 2) {
    renderBookView(selectedBookId, selectedTopic);
    return;
  }
  renderReadView(selectedBookId, selectedTopic);
};

const setState = (nextState) => {
  const stateValue = Number(nextState) || 1;
  if (stateSlider) {
    stateSlider.value = String(stateValue);
  }
  updateStateUI(stateValue);
  renderCurrentState();
};

const updateCurrentTopicLabel = () => {
  if (!currentTopicEl) return;
  currentTopicEl.textContent = selectedTopic || "All topics";
};

const getStoredTopic = () => {
  try {
    return localStorage.getItem(STORED_TOPIC_KEY);
  } catch (error) {
    return null;
  }
};

const parseChapterVerse = (refText) => {
  if (!refText) return null;
  const match = refText.match(/(\d+):(\d+)/);
  if (!match) return null;
  return {
    chapter: parseInt(match[1], 10),
    verse: parseInt(match[2], 10)
  };
};

const getAbsoluteVerseIndex = (bookId, chapterNumber, verseNumber) => {
  const book = bibleData[bookId];
  if (!book || !Array.isArray(book.chapters) || !chapterNumber || !verseNumber) return null;
  let total = 0;
  const limit = Math.min(chapterNumber - 1, book.chapters.length);
  for (let i = 0; i < limit; i += 1) {
    const chapter = book.chapters[i];
    const count = Number(chapter.verseCount) || (Array.isArray(chapter.verses) ? chapter.verses.length : 0);
    total += count;
  }
  return total + verseNumber;
};

const getBookVerseTotal = (bookId) => {
  const book = bibleData[bookId];
  if (!book || !Array.isArray(book.chapters)) return null;
  return book.chapters.reduce((sum, chapter) => {
    const count = Number(chapter.verseCount) || (Array.isArray(chapter.verses) ? chapter.verses.length : 0);
    return sum + count;
  }, 0);
};

const setStoredTopic = (topicName) => {
  try {
    if (topicName) {
      localStorage.setItem(STORED_TOPIC_KEY, topicName);
    } else {
      localStorage.removeItem(STORED_TOPIC_KEY);
    }
  } catch (error) {
    // Ignore storage failures; topic will not persist across refresh.
  }
};

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

  if (commit) {
    setStoredTopic(selectedTopic);
  }

  renderCurrentState();
  updateCurrentTopicLabel();
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
    list.className = "topic-datalist";
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
    updateStateUI(value);
  };
  stateSlider.addEventListener("input", () => {
    updateState();
    renderCurrentState();
  });
  updateState();
}

const goToBookView = (bookId) => {
  if (!bookId) return;
  selectedBookId = bookId;
  setState(2);
};

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
    titleBar.classList.add("is-clickable");
    titleBar.title = "Click to open Book view";
    titleBar.addEventListener("click", (e) => {
      e.stopPropagation();
      goToBookView(item.id);
    });

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
        const totalVerses = getBookVerseTotal(item.id) || verseCounts[item.id] || 1;
        
        // Group verses by proximity (within 2% are considered overlapping)
        const verseGroups = [];
        const OVERLAP_THRESHOLD = 2; // percentage points
        
        const versePositions = verseEntries.map((entry) => {
          const refs = Array.isArray(entry.refs) ? entry.refs : [];
          const primaryRef = refs[0] || "";
          const parsed = parseChapterVerse(primaryRef);
          const chapterNumber = parsed?.chapter || entry.chapter || null;
          const verseNumber = parsed?.verse || entry.verse || null;
          const absoluteVerse = getAbsoluteVerseIndex(item.id, chapterNumber, verseNumber) || entry.verse || 1;
          const percentage = (absoluteVerse / totalVerses) * 100;

          return {
            chapter: chapterNumber,
            verse: verseNumber,
            absoluteVerse,
            percentage,
            subtopics: Array.isArray(entry.subtopics) ? entry.subtopics : [],
            refs
          };
        });
        
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
              const maxColumns = 10;
              const columns = Math.min(group.length, maxColumns);
              const row = Math.floor(index / maxColumns);
              const column = index % maxColumns;
              const individualisedWidth = 100 / columns;
              lineEl.style.left = `${column * individualisedWidth}%`;
              lineEl.style.width = `${individualisedWidth}%`;
              if (row > 0) {
                lineEl.style.transform = `translateY(${row * 8}px)`;
              }
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
        
        const verseCount = verseEntries.length;

        // Add expand button
        const expandBtn = document.createElement("button");
        expandBtn.className = "expand-verses-btn";
        expandBtn.textContent = String(verseCount);
        expandBtn.title = verseCount === 1 ? "View 1 verse" : `View ${verseCount} verses`;
        expandBtn.setAttribute("aria-label", expandBtn.title);
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
    
    // Add info button for book summaries (always visible for non-separator books)
    if (!item.isSeparator) {
      const infoBtn = document.createElement("button");
      infoBtn.className = "info-btn";
      infoBtn.innerHTML = "ⓘ";
      const hasSummary = bookSummaries && bookSummaries[item.id];
      infoBtn.title = hasSummary ? "Book summary" : "Summary not available";
      infoBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (hasSummary) {
          showBookSummaryModal(item.id, item.displayName);
        }
      });
      tile.appendChild(infoBtn);
    }
    
    fragment.appendChild(tile);
  });

  treemapEl.appendChild(fragment);
};

const renderBookView = (bookId, topic = null) => {
  const grid = document.getElementById("book-grid");
  const titleEl = document.getElementById("book-title");
  const metaEl = document.getElementById("book-meta");
  const topicEl = document.getElementById("book-current-topic");
  if (!grid || !titleEl || !metaEl || !topicEl) return;

  grid.innerHTML = "";
  topicEl.textContent = selectedTopic || "All topics";

  const book = bookId ? bibleData[bookId] : null;
  if (!book || !Array.isArray(book.chapters)) {
    titleEl.textContent = "Book";
    metaEl.textContent = "Select a book to view chapters";
    return;
  }

  const bookName = book.name || BOOK_NAMES[bookId] || bookId;
  const totalVerses = getBookVerseTotal(bookId) || 0;
  titleEl.textContent = bookName;
  metaEl.textContent = `${book.chapters.length} chapters • ${totalVerses} verses`;

  const topicData = topic ? topicsData[topic] : null;
  const bookEntries = topicData && topicData.references ? topicData.references[bookId] : null;
  const entriesByChapter = new Map();

  if (bookEntries) {
    bookEntries.forEach((entry) => {
      const refs = Array.isArray(entry.refs) ? entry.refs : [];
      const primaryRef = refs[0] || "";
      const parsed = parseChapterVerse(primaryRef);
      const chapterNumber = parsed?.chapter || entry.chapter || null;
      const verseNumber = parsed?.verse || entry.verse || null;
      if (!chapterNumber || !verseNumber) return;
      if (!entriesByChapter.has(chapterNumber)) {
        entriesByChapter.set(chapterNumber, []);
      }
      entriesByChapter.get(chapterNumber).push({
        chapter: chapterNumber,
        verse: verseNumber,
        refs,
        subtopics: Array.isArray(entry.subtopics) ? entry.subtopics : []
      });
    });
  }

  const fragment = document.createDocumentFragment();
  book.chapters.forEach((chapter, index) => {
    const chapterNumber = Number(chapter.number) || index + 1;
    const card = document.createElement("article");
    card.className = "card card--abstract";

    const titleBar = document.createElement("div");
    titleBar.className = "card-title-bar";
    titleBar.textContent = `Chapter ${chapterNumber}`;
    card.appendChild(titleBar);

    const lines = document.createElement("div");
    lines.className = "pin-lines";

    const chapterEntries = entriesByChapter.get(chapterNumber) || [];
    if (chapterEntries.length > 0) {
      const chapterVerseTotal = Number(chapter.verseCount) || (Array.isArray(chapter.verses) ? chapter.verses.length : 1);
      const verseGroups = [];
      const OVERLAP_THRESHOLD = 2;

      const versePositions = chapterEntries.map((entry) => {
        const percentage = (entry.verse / chapterVerseTotal) * 100;
        return {
          chapter: entry.chapter,
          verse: entry.verse,
          percentage,
          subtopics: entry.subtopics,
          refs: entry.refs
        };
      });

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

      verseGroups.forEach((group) => {
        group.forEach((vp, index) => {
          const lineEl = document.createElement("div");
          lineEl.className = "pin-line";
          lineEl.style.position = "absolute";
          lineEl.style.top = `${vp.percentage}%`;

          if (group.length > 1) {
            const maxColumns = 10;
            const columns = Math.min(group.length, maxColumns);
            const row = Math.floor(index / maxColumns);
            const column = index % maxColumns;
            const individualisedWidth = 100 / columns;
            lineEl.style.left = `${column * individualisedWidth}%`;
            lineEl.style.width = `${individualisedWidth}%`;
            if (row > 0) {
              lineEl.style.transform = `translateY(${row * 8}px)`;
            }
          }

          const refText = (vp.refs && vp.refs[0]) ? vp.refs[0] : `Chapter ${vp.chapter}:${vp.verse}`;
          const subtopicText = (vp.subtopics && vp.subtopics.length > 0) ? vp.subtopics.join("; ") : "";
          lineEl.addEventListener("mouseenter", (e) => {
            showTooltip(e, refText, subtopicText, bookId, vp.verse);
          });
          lineEl.addEventListener("mouseleave", hideTooltip);
          lines.appendChild(lineEl);
        });
      });
    }

    card.appendChild(lines);
    fragment.appendChild(card);
  });

  grid.appendChild(fragment);
};

const renderReadView = (bookId, topic = null) => {
  const readTitle = document.getElementById("read-title");
  const readMeta = document.getElementById("read-meta");
  const readTopic = document.getElementById("read-current-topic");
  if (!readTitle || !readMeta || !readTopic) return;
  const book = bookId ? bibleData[bookId] : null;
  const bookName = book?.name || BOOK_NAMES[bookId] || "Verse";
  readTitle.textContent = bookName;
  readMeta.textContent = book ? "Choose a verse to read" : "Select a book first";
  readTopic.textContent = selectedTopic || "All topics";
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

const loadBookSummaries = async () => {
  try {
    const response = await fetch("data/book-summaries.json", { cache: "no-store" });
    if (!response.ok) throw new Error("Missing book summaries");
    const data = await response.json();
    return data || {};
  } catch (error) {
    console.warn("Failed to load book summaries:", error);
    return {};
  }
};

const boot = async () => {
  if (!treemapEl) return;
  booksData = await loadBooks();
  verseCounts = await loadVerseCounts();
  bibleData = await loadBible();
  bookSummaries = await loadBookSummaries();
  
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

    const storedTopic = resolveTopicKey(getStoredTopic());
    if (storedTopic) {
      applyTopicSelection(storedTopic, { commit: true });
    } else {
      applyTopicSelection(DEFAULT_TOPIC, { commit: true });
    }
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
  
  renderCurrentState();
  attachGenreLegend();

  const observer = new ResizeObserver(() => {
    renderCurrentState();
  });
  observer.observe(treemapEl);
};

const showBookSummaryModal = (bookId, bookName) => {
  const summary = bookSummaries[bookId];
  if (!summary) return;
  
  // Create modal overlay
  const modal = document.createElement("div");
  modal.className = "verse-modal-overlay";
  
  const modalContent = document.createElement("div");
  modalContent.className = "verse-modal";
  
  const header = document.createElement("div");
  header.className = "verse-modal-header";
  header.innerHTML = `<h3>${bookName}</h3><p>Book Summary</p>`;
  
  const closeBtn = document.createElement("button");
  closeBtn.className = "verse-modal-close";
  closeBtn.innerHTML = "✕";
  closeBtn.addEventListener("click", () => modal.remove());
  header.appendChild(closeBtn);
  
  const content = document.createElement("div");
  content.className = "verse-modal-content";
  
  const summaryText = document.createElement("p");
  summaryText.className = "book-summary-text";
  summaryText.textContent = summary.summary;
  content.appendChild(summaryText);
  
  modalContent.appendChild(header);
  modalContent.appendChild(content);
  modal.appendChild(modalContent);
  
  // Close on overlay click
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.remove();
  });
  
  document.body.appendChild(modal);
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

  const parseRefChapterVerse = (ref) => {
    if (!ref) return null;
    const match = ref.match(/(\d+):(\d+)/);
    if (!match) return null;
    return { chapter: Number(match[1]), verse: Number(match[2]) };
  };

  const buildRangeLabel = (startRef, endRef, startChapter, endChapter, startVerse, endVerse) => {
    if (startVerse === endVerse) {
      if (startRef) return startRef;
      if (startChapter) return `${bookName} ${startChapter}:${startVerse}`;
      return `${bookName} ${startVerse}`;
    }

    const startPrefix = startRef && startRef.includes(":") ? startRef.split(":")[0] : bookName;
    const endPrefix = endRef && endRef.includes(":") ? endRef.split(":")[0] : bookName;

    if (startChapter && endChapter && startChapter === endChapter) {
      if (startPrefix && endPrefix && startPrefix === endPrefix) {
        return `${startPrefix}:${startVerse}-${endVerse}`;
      }
      return `${bookName} ${startChapter}:${startVerse}-${endVerse}`;
    }

    if (startRef && endRef) {
      return `${startRef} - ${endRef}`;
    }

    if (startChapter && endChapter) {
      return `${bookName} ${startChapter}:${startVerse} - ${bookName} ${endChapter}:${endVerse}`;
    }

    return `${bookName} ${startVerse}-${endVerse}`;
  };

  const mergeAdjacentVerses = (positions) => {
    const sorted = [...positions].sort((a, b) => {
      const chapterA = a.chapter ?? parseRefChapterVerse((a.refs || [])[0])?.chapter ?? 0;
      const chapterB = b.chapter ?? parseRefChapterVerse((b.refs || [])[0])?.chapter ?? 0;
      if (chapterA !== chapterB) {
        return chapterA - chapterB;
      }
      return (a.verse ?? 0) - (b.verse ?? 0);
    });
    const groups = [];

    sorted.forEach((vp) => {
      const primaryRef = (vp.refs || [])[0] || "";
      const parsedRef = parseRefChapterVerse(primaryRef);
      const chapterNumber = vp.chapter ?? parsedRef?.chapter ?? null;
      const verseNumber = vp.verse ?? parsedRef?.verse ?? null;
      const subtopicText = (vp.subtopics || []).join("; ");
      const refText = primaryRef || `Verse ${verseNumber ?? vp.verse}`;
      const last = groups[groups.length - 1];

      if (
        last &&
        chapterNumber !== null &&
        last.chapter === chapterNumber &&
        verseNumber !== null &&
        verseNumber === last.endVerse + 1 &&
        subtopicText === last.subtopicText
      ) {
        last.endVerse = verseNumber;
        last.endPercentage = vp.percentage;
        last.refs.push(...(vp.refs || []));
      } else {
        groups.push({
          chapter: chapterNumber,
          startVerse: verseNumber ?? vp.verse,
          endVerse: verseNumber ?? vp.verse,
          startPercentage: vp.percentage,
          endPercentage: vp.percentage,
          subtopicText,
          refs: [...(vp.refs || [])],
          refText
        });
      }
    });

    const minGapPct = 3.5;
    let lastTop = -Infinity;

    return groups.map((group) => {
      const startRef = group.refs[0] || group.refText;
      const endRef = group.refs[group.refs.length - 1] || startRef;
      const rangeLabel = buildRangeLabel(
        startRef,
        endRef,
        group.chapter,
        group.chapter,
        group.startVerse,
        group.endVerse
      );
      const percentage = (group.startPercentage + group.endPercentage) / 2;
      let renderTop = percentage;

      if (renderTop < lastTop + minGapPct) {
        renderTop = lastTop + minGapPct;
      }

      lastTop = renderTop;

      return {
        startVerse: group.startVerse,
        endVerse: group.endVerse,
        percentage,
        renderTop: Math.min(renderTop, 100),
        rangeLabel,
        subtopicText: group.subtopicText,
        refs: group.refs
      };
    });
  };

  const buildVerseDetailLines = (group) => {
    if (!group.refs || group.refs.length === 0) {
      return ["Verse text unavailable."];
    }

    const lines = [];
    group.refs.forEach((ref) => {
      const parsed = parseRefChapterVerse(ref);
      if (!parsed) return;
      const verseText = getVerseText(bookId, parsed.chapter, parsed.verse);
      if (verseText) {
        lines.push(`${ref} — ${verseText}`);
      }
    });

    if (lines.length === 0) {
      lines.push("Verse text unavailable.");
    }

    return lines;
  };
  
  // Create visual representation with separated lines
  const visualization = document.createElement("div");
  visualization.className = "verse-visualization";
  
  const groupedPositions = mergeAdjacentVerses(versePositions);
  let detailPopup = null;
  const lineByKey = new Map();
  const listByKey = new Map();
  let listTooltipHideTimer = null;
  
  // Determine if scrolling is needed based on verse density
  const MIN_PIXELS_PER_GROUP = 60; // Minimum pixels to allocate per verse group
  const numGroups = groupedPositions.length;
  
  // Check if verses need more space than default container height
  const scrollingNeeded = numGroups > 8; // Heuristic: if more than ~8 groups, likely need scrolling
  let visualizationHeight = null;
  
  if (scrollingNeeded && numGroups > 0) {
    // Calculate height needed to spread lines without bunching
    visualizationHeight = Math.max(
      numGroups * MIN_PIXELS_PER_GROUP,
      600 // Minimum height even if few groups
    );
  }
  
  // Apply calculated height if scrolling is needed
  if (visualizationHeight) {
    visualization.style.height = `${visualizationHeight}px`;
  }
  
  // Store middle group index for later alignment
  const middleGroupIndex = Math.floor(numGroups / 2);

  const setActiveGroup = (key) => {
    const line = lineByKey.get(key);
    const item = listByKey.get(key);
    if (line) line.classList.add("is-active");
    if (item) item.classList.add("is-active");
  };

  const clearActiveGroup = (key) => {
    const line = lineByKey.get(key);
    const item = listByKey.get(key);
    if (line) line.classList.remove("is-active");
    if (item) item.classList.remove("is-active");
  };

  const showVerseDetail = (group) => {
    if (detailPopup) detailPopup.remove();
    hideTooltip();

    const detail = document.createElement("div");
    detail.className = "verse-detail-pop";

    const header = document.createElement("div");
    header.className = "verse-detail-header";
    const title = document.createElement("strong");
    title.textContent = group.rangeLabel;
    header.appendChild(title);

    if (group.subtopicText) {
      const subtitle = document.createElement("span");
      subtitle.className = "verse-detail-subtopic";
      subtitle.textContent = group.subtopicText;
      header.appendChild(subtitle);
    }

    const closeBtn = document.createElement("button");
    closeBtn.className = "verse-detail-close";
    closeBtn.type = "button";
    closeBtn.textContent = "✕";
    closeBtn.addEventListener("click", () => detail.remove());
    header.appendChild(closeBtn);

    const body = document.createElement("div");
    body.className = "verse-detail-body";
    body.textContent = buildVerseDetailLines(group).join("\n\n");

    detail.appendChild(header);
    detail.appendChild(body);

    detailPopup = detail;
    modalContent.appendChild(detail);
  };

  groupedPositions.forEach((group, index) => {
    const groupKey = `group-${index}`;
    const verseItem = document.createElement("div");
    verseItem.className = "verse-item";
    
    const line = document.createElement("div");
    line.className = "verse-line";
    line.dataset.groupKey = groupKey;
    line.style.top = `${group.renderTop}%`;
    const subtopicText = group.subtopicText;
    const refText = group.rangeLabel;

    lineByKey.set(groupKey, line);
    
    line.addEventListener('mouseenter', (e) => {
      setActiveGroup(groupKey);
      showTooltip(e, refText, subtopicText, bookId, group.startVerse);
    });
    line.addEventListener('mouseleave', () => {
      clearActiveGroup(groupKey);
      hideTooltip();
    });
    line.style.cursor = "pointer";
    line.addEventListener("click", () => {
      showVerseDetail(group);
    });
    
    const label = document.createElement("span");
    label.className = "verse-label";
    label.textContent = refText;
    label.style.top = `${group.renderTop}%`;
    
    verseItem.appendChild(line);
    verseItem.appendChild(label);
    visualization.appendChild(verseItem);
  });
  
  content.appendChild(visualization);
  
  // Verse list
  const list = document.createElement("div");
  list.className = "verse-list";
  
  groupedPositions.forEach((group, index) => {
    const groupKey = `group-${index}`;
    const item = document.createElement("div");
    item.className = "verse-list-item";
    item.dataset.groupKey = groupKey;
    const subtopicText = group.subtopicText;
    const refText = group.rangeLabel;
    item.innerHTML = `<strong>${refText}</strong>`;
    if (subtopicText) {
      const detail = document.createElement("span");
      detail.className = "verse-subtopic";
      detail.textContent = subtopicText;
      item.appendChild(detail);
    }
    listByKey.set(groupKey, item);
    item.addEventListener("mouseenter", (e) => {
      if (listTooltipHideTimer) {
        clearTimeout(listTooltipHideTimer);
        listTooltipHideTimer = null;
      }
      setActiveGroup(groupKey);
      showTooltip(e, refText, subtopicText, bookId, group.startVerse);
    });
    item.addEventListener("mousemove", updateTooltipPosition);
    item.addEventListener("mouseleave", () => {
      clearActiveGroup(groupKey);
      listTooltipHideTimer = setTimeout(() => {
        hideTooltip();
      }, 80);
    });
    item.style.cursor = "pointer";
    item.addEventListener("click", () => {
      showVerseDetail(group);
    });
    list.appendChild(item);
  });
  
  content.appendChild(list);
  
  // Sync scroll between visualization and list
  visualization.addEventListener("scroll", () => {
    list.scrollTop = visualization.scrollTop;
  });
  list.addEventListener("scroll", () => {
    visualization.scrollTop = list.scrollTop;
  });
  
  // If scrolling is enabled, center-align the middle line with the middle button
  if (scrollingNeeded && visualizationHeight && middleGroupIndex < groupedPositions.length) {
    // Calculate the pixel position of the middle group
    const middleGroup = groupedPositions[middleGroupIndex];
    const middleLinePixelPosition = (middleGroup.renderTop / 100) * visualizationHeight;
    
    // Center this position in the viewport (assume ~400px default height)
    const viewportHeight = 400;
    const scrollTarget = Math.max(0, middleLinePixelPosition - (viewportHeight / 2));
    
    // Set initial scroll position on next frame to ensure DOM is ready
    requestAnimationFrame(() => {
      visualization.scrollTop = scrollTarget;
      list.scrollTop = scrollTarget;
    });
  }
  
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

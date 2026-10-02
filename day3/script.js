// Starting data
let notes = [
  { id: 1, text: "Buy milk and bread", category: "personal" },
  { id: 2, text: "Finish the Day 3 assignment", category: "study" },
  { id: 3, text: "Email the project report to Grace", category: "work" },
  { id: 4, text: "Revise JavaScript arrays", category: "study" },
  { id: 5, text: "Call mum", category: "personal" },
];

const CATEGORIES = ["personal", "work", "study"];

// Lowercase, trim and collapse repeated spaces so comparisons are fair
function normalize(text) {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

// 1. Notes whose text contains the word, ignoring case
function searchNotes(word) {
  const target = word.toLowerCase();
  return notes.filter((note) => note.text.toLowerCase().includes(target));
}

// 2. The note with the most characters, or null if there are none
function longestNote() {
  if (notes.length === 0) {
    return null;
  }
  let longest = notes[0];
  for (const note of notes) {
    if (note.text.length > longest.text.length) {
      longest = note;
    }
  }
  return longest;
}

// 3. Count of notes per category
function countByCategory() {
  const counts = {};
  for (const note of notes) {
    counts[note.category] = (counts[note.category] || 0) + 1;
  }
  return counts;
}

// 4. A summary sentence
function getSummary() {
  const counts = countByCategory();
  const total = notes.length;
  const label = total === 1 ? "note" : "notes";
  const parts = CATEGORIES.map(
    (category) => `${counts[category] || 0} ${category}`
  );
  return `${total} ${label}: ${parts.join(", ")}.`;
}

// 5. True if a note with the same text exists (ignoring case and extra spaces)
function isDuplicate(text) {
  const target = normalize(text);
  return notes.some((note) => normalize(note.text) === target);
}

// 6. Add a note if it passes every check
function addNote(text, category) {
  const cleaned = text.trim();
  if (cleaned.length < 1 || cleaned.length > 200) {
    console.log("Rejected: note must be 1 to 200 characters.");
    return false;
  }
  if (!CATEGORIES.includes(category)) {
    console.log(`Rejected: category must be personal, work or study (got "${category}").`);
    return false;
  }
  if (isDuplicate(cleaned)) {
    console.log("Rejected: a note with the same text already exists.");
    return false;
  }
  const nextId =
    notes.length === 0 ? 1 : Math.max(...notes.map((note) => note.id)) + 1;
  notes.push({ id: nextId, text: cleaned, category: category });
  console.log(`Added note ${nextId}: "${cleaned}" (${category})`);
  return true;
}

// ---------------- TESTS ----------------

// searchNotes
console.log("search MILK:", searchNotes("MILK"));
// [ { id: 1, text: "Buy milk and bread", category: "personal" } ]
console.log("search xyz:", searchNotes("xyz"));
// [] (edge case: no results)

// longestNote
console.log("longest:", longestNote());
// { id: 3, text: "Email the project report to Grace", category: "work" }

// countByCategory
console.log("counts:", countByCategory());
// { personal: 2, study: 2, work: 1 }

// getSummary
console.log("summary:", getSummary());
// "5 notes: 2 personal, 1 work, 2 study."

// isDuplicate
console.log("dup 1:", isDuplicate("  BUY   milk and BREAD "));
// true (ignores case and extra spaces)
console.log("dup 2:", isDuplicate("Buy eggs"));
// false

// Edge cases with an empty list and a one note list
const savedNotes = notes;
notes = [];
console.log("empty longest:", longestNote());
// null
console.log("empty counts:", countByCategory());
// {}
console.log("empty summary:", getSummary());
// "0 notes: 0 personal, 0 work, 0 study."
notes = [savedNotes[0]];
console.log("single summary:", getSummary());
// "1 note: 1 personal, 0 work, 0 study."
notes = savedNotes;

// addNote (these change the data, so they come last)
console.log("add valid:", addNote("Prepare for Day 4", "study"));
// logs: Added note 6: "Prepare for Day 4" (study), then true
console.log("add duplicate:", addNote("call mum", "personal"));
// logs: Rejected: a note with the same text already exists., then false
console.log("add empty:", addNote("   ", "work"));
// logs: Rejected: note must be 1 to 200 characters., then false
console.log("add too long:", addNote("a".repeat(201), "work"));
// logs: Rejected: note must be 1 to 200 characters., then false
console.log("add bad category:", addNote("Plan holiday", "leisure"));
// logs: Rejected: category must be personal, work or study (got "leisure")., then false
console.log("summary after add:", getSummary());
// "6 notes: 2 personal, 1 work, 3 study."
#!/usr/bin/env node
// Parses the MBCT book text file and generates chapters.js for the web app

const fs = require('fs');
const path = require('path');

const SRC = '/root/.claude/uploads/6b12e737-4e54-5210-95af-3e8337b81aba/3d09e7f1-MBCT_Distinctive_Features_full_text.txt';
const OUT = path.join(__dirname, 'chapters.js');

const raw = fs.readFileSync(SRC, 'utf8');
const lines = raw.split('\n');

// Fix PDF ligature artifacts from the scanned text
function fix(text) {
  return text
    .replace(/®/g, 'fi')
    .replace(/¯/g, 'fl')
    .replace(/Ð/g, '—')
    .replace(/±/g, '–')
    .replace(/``/g, '“')
    .replace(/''/g, '”')
    .replace(/Ø/g, '©');
}

function isRunningHeader(line) {
  const t = line.trim();
  return t === 'MINDFULNESS-BASED COGNITIVE THERAPY' ||
         t === 'DISTINCTIVE THEORETICAL FEATURES OF MBCT' ||
         t === 'DISTINCTIVE PRACTICAL FEATURES OF MBCT';
}

function isPageNumber(line) {
  return /^\s*\d{1,3}\s*$/.test(line);
}

const chapterMeta = [
  { n: 1,  part: 1, title: "An integration of Mindfulness-Based Stress Reduction and Cognitive Behavioural Therapy" },
  { n: 2,  part: 1, title: "Underpinned by the cognitive theory of vulnerability to depression" },
  { n: 3,  part: 1, title: "Learning skills to reduce the risk of depressive relapse" },
  { n: 4,  part: 1, title: "The significance of automatic pilot" },
  { n: 5,  part: 1, title: "Modes of mind: 'doing'" },
  { n: 6,  part: 1, title: "Doing mode in action: the effects of rumination" },
  { n: 7,  part: 1, title: "Doing mode in action: the effects of experiential avoidance" },
  { n: 8,  part: 1, title: "Reacting and responding to experience: avoidance and approach" },
  { n: 9,  part: 1, title: "Modes of mind: 'being'" },
  { n: 10, part: 1, title: "Body sensations — a door into the present" },
  { n: 11, part: 1, title: "Ways of approaching and welcoming what is" },
  { n: 12, part: 1, title: "Developing a new relationship with experience" },
  { n: 13, part: 1, title: "Awareness as a container of our experience" },
  { n: 14, part: 1, title: "Working with general and specific vulnerability" },
  { n: 15, part: 1, title: "The MBCT evidence base" },
  { n: 16, part: 2, title: "Course content and structure" },
  { n: 17, part: 2, title: "Session themes" },
  { n: 18, part: 2, title: "Assessment and orientation" },
  { n: 19, part: 2, title: "Eating a raisin with awareness" },
  { n: 20, part: 2, title: "Body scan practice" },
  { n: 21, part: 2, title: "Mindful movement practice" },
  { n: 22, part: 2, title: "Sitting meditation practice" },
  { n: 23, part: 2, title: "The Three Minute Breathing Space" },
  { n: 24, part: 2, title: "The importance of home practice" },
  { n: 25, part: 2, title: "Mindfulness practice in everyday life" },
  { n: 26, part: 2, title: "Pleasant and unpleasant experiences" },
  { n: 27, part: 2, title: "Cognitive behavioural curriculum elements" },
  { n: 28, part: 2, title: "Investigating experience" },
  { n: 29, part: 2, title: "The MBCT learning environment" },
  { n: 30, part: 2, title: "Teaching through embodiment" },
];

// Find where each chapter's content starts in the line array.
// Strategy: find the running header, then scan to the chapter number line,
// then body starts at chapter_number_line + 1 (includes title text too — that's fine,
// as the title text is part of the book's flow in the original).
function findChapterStarts() {
  const starts = [];
  for (let i = 0; i < lines.length; i++) {
    if (!isRunningHeader(lines[i])) continue;
    // Scan forward past blanks to find the chapter number
    let j = i + 1;
    while (j < lines.length && lines[j].trim() === '') j++;
    const num = parseInt(lines[j]);
    if (isNaN(num) || num < 1 || num > 30) continue;
    // Body starts right after the chapter number line (j)
    // This includes the multi-line title text + all body paragraphs
    starts.push({ chapterIdx: num - 1, rawBodyStart: j + 1 });
  }
  return starts;
}

const starts = findChapterStarts();
starts.sort((a, b) => a.rawBodyStart - b.rawBodyStart);

function extractBody(fromLine, toLine) {
  const bodyLines = [];
  for (let i = fromLine; i < toLine; i++) {
    const line = lines[i];
    if (isRunningHeader(line)) continue;
    if (isPageNumber(line)) continue;
    bodyLines.push(fix(line));
  }
  return bodyLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// Find the preview: first complete sentence of real content, after stripping the
// chapter title that flows directly into the body text in the PDF (no blank line separator).
function extractPreview(body, chapterTitle) {
  const flat = body.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();

  // Strip the chapter title text from the beginning (it flows right into the body in the PDF).
  // Compare normalized (alpha-only) versions.
  const titleAlpha = chapterTitle.toLowerCase().replace(/[^a-z]/g, '');
  const flatAlpha  = flat.toLowerCase().replace(/[^a-z]/g, '');

  let contentStart = 0;
  // If the body starts with the title text (first 25 alpha chars match), skip past the title
  if (flatAlpha.startsWith(titleAlpha.slice(0, Math.min(25, titleAlpha.length)))) {
    let matched = 0;
    for (let i = 0; i < flat.length && matched < titleAlpha.length; i++) {
      if (/[a-zA-Z]/.test(flat[i])) matched++;
      contentStart = i + 1;
    }
  }

  const content = flat.slice(contentStart).trim();

  // Return first substantial sentence from the content
  const sentences = content.match(/[A-Z"'][^.!?]{40,}[.!?]/g) || [];
  for (const s of sentences) {
    if (s.trim().length >= 80) return s.trim();
  }
  return content.slice(0, 240).trim();
}

// Build chapter objects
const chapters = chapterMeta.map((meta, idx) => {
  const start = starts.find(s => s.chapterIdx === idx);
  if (!start) { console.warn(`No start found for chapter ${idx + 1}`); return null; }
  const nextStart = starts.find(s => s.rawBodyStart > start.rawBodyStart);
  const endLine = nextStart ? nextStart.rawBodyStart - 5 : lines.length;

  const body = extractBody(start.rawBodyStart, endLine);
  const preview = extractPreview(body, meta.title);

  return { id: meta.n, part: meta.part, title: meta.title, preview, body };
}).filter(Boolean);

chapters.sort((a, b) => a.id - b.id);

const js = `// Auto-generated from MBCT book text — do not edit manually\nconst CHAPTERS = ${JSON.stringify(chapters, null, 2)};\n`;
fs.writeFileSync(OUT, js, 'utf8');
console.log(`Written ${chapters.length} chapters to ${OUT}`);
chapters.forEach(c => console.log(`  ${c.id}. preview: "${c.preview.slice(0, 80).replace(/\n/g, ' ')}..."`));

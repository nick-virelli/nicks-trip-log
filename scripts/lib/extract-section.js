// Pulls one H2 "## Heading text" section (up to the next top-level H2, or EOF)
// out of a larger markdown file, keyed by a distinctive substring of the heading.
function extractSection(fullText, headingSubstring) {
  const lines = fullText.split(/\r?\n/);
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^##(?!#)\s*(.*)$/);
    if (m && m[1].trim().includes(headingSubstring)) {
      start = i;
      break;
    }
  }
  if (start === -1) throw new Error(`Section not found: ${headingSubstring}`);
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##(?!#)\s*\S/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join('\n');
}

module.exports = { extractSection };

// Splices media-only nodes from a "pics" parse (has images, e.g. PICS PART 2 file)
// into the corresponding "main" parse (has the word-for-word text, but no images
// for this section) by walking both trees in document order. Assumes the two
// sources have near-identical non-media bullet structure, which held true for
// every section this was checked against.
function mergeNode(mainNode, picsNode) {
  let mi = 0;
  const merged = [];
  for (const pc of picsNode.children) {
    if (pc.media) {
      merged.push(pc);
    } else if (mi < mainNode.children.length) {
      const mc = mainNode.children[mi++];
      mergeNode(mc, pc);
      merged.push(mc);
    }
  }
  while (mi < mainNode.children.length) merged.push(mainNode.children[mi++]);
  mainNode.children = merged;
}

function mergeMediaIntoDays(mainDays, picsDays) {
  const n = Math.min(mainDays.length, picsDays.length);
  for (let i = 0; i < n; i++) mergeNode(mainDays[i], picsDays[i]);
  if (mainDays.length !== picsDays.length) {
    console.warn(`  ! day count mismatch during media merge: main=${mainDays.length} pics=${picsDays.length}`);
  }
  return mainDays;
}

module.exports = { mergeMediaIntoDays };

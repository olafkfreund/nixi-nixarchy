// Replaces each ```nixi-chart block in the agent's answer with a chart the
// bridge draws and saves itself, so it works at Guide, where the agent may not
// write a file. A stream filter, in the shape of learned.js: ordinary text
// passes straight through; only a block that has opened is held until it closes,
// because a fence arrives split across chunks. A block MediaModel.chartSvg
// rejects, or one that never closes, is released exactly as it came and renders
// as the ordinary code block it is.
import { createRequire } from "node:module";
import { svgMarkdown } from "./media.js";

// MediaModel.js is shared with QML, so it is CommonJS.
const { chartSvg } = createRequire(import.meta.url)("../MediaModel.js");

const OPEN = /^ {0,3}```nixi-chart\s*$/;
const CLOSE = /^ {0,3}```\s*$/;
const OPEN_PREFIX = "```nixi-chart";

export function createChartFilter(mediaDir) {
  let pending = "";
  let block = null;   // { lines, raw } while inside a nixi-chart fence
  // A fence is only a fence at the START of a line. Without this the filter
  // forgets it is mid-line after flushing a partial one, and the rest of a
  // sentence like "Open a block with ```nixi-chart" gets held and then read as
  // an opening fence -- so the output depended on where the stream was chunked.
  let atLineStart = true;

  function finish() {
    const done = block;
    block = null;
    const chart = chartSvg(done.lines.join("\n"));
    const markdown = chart ? svgMarkdown(chart.svg, chart.title, mediaDir) : null;
    return markdown || done.raw;
  }

  // whole says this text began at a line start; a tail left over from a line
  // already partly emitted can never open or close a fence.
  function line(text, terminator, whole) {
    if (block) {
      block.raw += text + terminator;
      if (whole && CLOSE.test(text)) return finish();
      block.lines.push(text);
      return "";
    }
    if (whole && OPEN.test(text)) { block = { lines: [], raw: text + terminator }; return ""; }
    return text + terminator;
  }

  function couldBeOpen(partial) {
    const start = partial.replace(/^ {0,3}/, "");
    return partial.length - start.length <= 3
      && (start.length < OPEN_PREFIX.length ? OPEN_PREFIX.startsWith(start) : start.startsWith(OPEN_PREFIX));
  }

  return {
    push(text) {
      pending += text;
      let out = "";
      let index;
      while ((index = pending.indexOf("\n")) >= 0) {
        const text = pending.slice(0, index);
        pending = pending.slice(index + 1);
        out += line(text, "\n", atLineStart);
        atLineStart = true;
      }
      // Hold a partial line only where it could still become an opening fence,
      // which it can only do at the start of a line.
      if (!block && pending && !(atLineStart && couldBeOpen(pending))) {
        out += pending;
        pending = "";
        atLineStart = false;
      }
      return out;
    },
    flush() {
      let out = "";
      if (block && atLineStart && CLOSE.test(pending)) { block.raw += pending; pending = ""; out = finish(); }
      if (block) { out = block.raw; block = null; }
      out += pending;
      pending = "";
      return out;
    },
  };
}

import { Position, type TextEditor } from 'vscode';
import { mapOriginalToNormalized } from '../position-mapping';

/**
 * A render window expressed as an inclusive interval of NORMALIZED text offsets
 * `[startOffset, endOffset]`.
 *
 * Decoration positions emitted by the parser are in normalized (CRLF→LF) text
 * coordinates, so the window is too. Decorations whose `[startPos, endPos]` do
 * not intersect this interval are skipped, making the per-pass filter/apply cost
 * scale with the viewport rather than the whole document.
 */
export interface RenderWindow {
  startOffset: number;
  endOffset: number;
}

/**
 * Computes the viewport render window for an editor: the currently visible line
 * span expanded by one page (the visible line count) above and below. The extra
 * page on each side pre-renders decorations just outside the viewport so that
 * scrolling reveals already-styled content instead of a flash of raw markdown.
 *
 * Returns `null` when the expanded window already covers the whole document
 * (small/medium files) or when visible ranges are unavailable. Callers treat
 * `null` as "render everything", which preserves the pre-optimization behaviour.
 *
 * @param editor - The active editor whose viewport defines the window.
 * @param originalText - The editor's original document text (CRLF preserved).
 *   Window boundaries are computed as original-document offsets and converted to
 *   normalized offsets so they line up with parser decoration positions.
 */
export function computeRenderWindow(editor: TextEditor, originalText: string): RenderWindow | null {
  const visibleRanges = editor.visibleRanges;
  if (!visibleRanges || visibleRanges.length === 0) {
    return null;
  }

  const document = editor.document;
  const lineCount = document.lineCount;
  if (lineCount <= 0) {
    return null;
  }

  const firstVisibleLine = visibleRanges[0].start.line;
  const lastVisibleLine = visibleRanges[visibleRanges.length - 1].end.line;

  // One "page" of margin on each side = the number of lines currently visible.
  const pageSize = Math.max(1, lastVisibleLine - firstVisibleLine + 1);
  const topLine = Math.max(0, firstVisibleLine - pageSize);
  const bottomLine = Math.min(lineCount - 1, lastVisibleLine + pageSize);

  // The whole document fits inside the window — nothing to skip, so don't pay
  // the filtering cost or risk dropping anything.
  if (topLine <= 0 && bottomLine >= lineCount - 1) {
    return null;
  }

  const startOriginal = document.offsetAt(new Position(topLine, 0));
  // Extend to the start of the line after bottomLine (or document end) so the
  // entire bottom line is inside the window.
  const endOriginal =
    bottomLine + 1 < lineCount
      ? document.offsetAt(new Position(bottomLine + 1, 0))
      : document.offsetAt(new Position(bottomLine, Number.MAX_SAFE_INTEGER));

  return {
    startOffset: mapOriginalToNormalized(startOriginal, originalText),
    endOffset: mapOriginalToNormalized(endOriginal, originalText),
  };
}

/**
 * Returns true when a decoration's normalized `[startPos, endPos]` interval
 * intersects the render window. A decoration that merely crosses the window
 * (e.g. a fenced code block starting above and ending inside it) is included.
 */
export function decorationIntersectsWindow(
  decoration: { startPos: number; endPos: number },
  window: RenderWindow
): boolean {
  return decoration.startPos <= window.endOffset && decoration.endPos >= window.startOffset;
}

import { computeRenderWindow, decorationIntersectsWindow } from '../viewport-window';
import type { RenderWindow } from '../viewport-window';
import { TextDocument, TextEditor, Selection, Position, Range, Uri } from '../../test/__mocks__/vscode';

function makeDoc(lineCount: number, lineText = 'line'): InstanceType<typeof TextDocument> {
  const text = Array.from({ length: lineCount }, () => lineText).join('\n');
  return new TextDocument(Uri.file('test.md'), 'markdown', 1, text);
}

function makeEditor(
  doc: InstanceType<typeof TextDocument>,
  visibleStartLine: number,
  visibleEndLine: number,
): InstanceType<typeof TextEditor> {
  const sel = new Selection(new Position(0, 0), new Position(0, 0));
  const visible = new Range(
    new Position(visibleStartLine, 0),
    new Position(visibleEndLine, 0),
  );
  return new TextEditor(doc, [sel], [visible]);
}

describe('computeRenderWindow', () => {
  it('returns null when there are no visible ranges', () => {
    const doc = makeDoc(500);
    const editor = new TextEditor(doc, [new Selection(new Position(0, 0), new Position(0, 0))], []);
    expect(computeRenderWindow(editor as any, doc.getText())).toBeNull();
  });

  it('returns null when the expanded window already covers the whole document', () => {
    // 20-line doc, viewing lines 5..14 (10 visible) -> margin 10 each side ->
    // window lines [0, 19] cover the whole document.
    const doc = makeDoc(20);
    const editor = makeEditor(doc, 5, 14);
    expect(computeRenderWindow(editor as any, doc.getText())).toBeNull();
  });

  it('scopes to visible span plus one page each side on a long document', () => {
    // 1000 lines, viewing lines 500..549 (50 visible) -> margin 50 each side.
    // Window lines: [450, 599].
    const doc = makeDoc(1000);
    const editor = makeEditor(doc, 500, 549);
    const window = computeRenderWindow(editor as any, doc.getText());
    expect(window).not.toBeNull();

    const startOffset = doc.offsetAt(new Position(450, 0));
    const endOffset = doc.offsetAt(new Position(600, 0)); // start of line after bottomLine (599)
    expect(window).toEqual<RenderWindow>({ startOffset, endOffset });
  });

  it('clamps the window to document bounds near the top', () => {
    const doc = makeDoc(1000);
    const editor = makeEditor(doc, 0, 49); // top of doc
    const window = computeRenderWindow(editor as any, doc.getText());
    expect(window).not.toBeNull();
    expect(window?.startOffset).toBe(0); // topLine clamped to 0
  });

  it('clamps the window to document end when scrolled to the bottom', () => {
    const doc = makeDoc(1000);
    const editor = makeEditor(doc, 950, 999); // bottom of doc
    const window = computeRenderWindow(editor as any, doc.getText());
    expect(window).not.toBeNull();
    expect(window?.endOffset).toBe(doc.getText().length);
  });
});

describe('decorationIntersectsWindow', () => {
  const window: RenderWindow = { startOffset: 100, endOffset: 200 };

  it('keeps a decoration fully inside the window', () => {
    expect(decorationIntersectsWindow({ startPos: 120, endPos: 140 }, window)).toBe(true);
  });

  it('keeps a decoration that crosses the top boundary', () => {
    expect(decorationIntersectsWindow({ startPos: 50, endPos: 110 }, window)).toBe(true);
  });

  it('keeps a decoration that crosses the bottom boundary', () => {
    expect(decorationIntersectsWindow({ startPos: 190, endPos: 260 }, window)).toBe(true);
  });

  it('keeps a decoration that spans the whole window', () => {
    expect(decorationIntersectsWindow({ startPos: 0, endPos: 999 }, window)).toBe(true);
  });

  it('drops a decoration entirely above the window', () => {
    expect(decorationIntersectsWindow({ startPos: 10, endPos: 90 }, window)).toBe(false);
  });

  it('drops a decoration entirely below the window', () => {
    expect(decorationIntersectsWindow({ startPos: 210, endPos: 300 }, window)).toBe(false);
  });

  it('treats boundary-touching decorations as intersecting', () => {
    expect(decorationIntersectsWindow({ startPos: 200, endPos: 220 }, window)).toBe(true);
    expect(decorationIntersectsWindow({ startPos: 80, endPos: 100 }, window)).toBe(true);
  });
});

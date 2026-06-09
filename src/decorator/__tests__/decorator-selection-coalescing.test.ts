vi.mock('../../parser', () => ({
  MarkdownParser: class {
    extractDecorations() {
      return [];
    }
  },
}));

import { Decorator } from '../../decorator';
import { TextDocument, TextEditor, Selection, Position, Uri } from '../../test/__mocks__/vscode';

function makeDecorator(languageId = 'markdown') {
  const text = '# Title\n\nsome **bold** text\n';
  const document = new TextDocument(Uri.file('test.md'), languageId, 1, text);
  const editor = new TextEditor(document, [new Selection(new Position(0, 0), new Position(0, 0))]);
  const parseCache = {
    get: () => ({ version: 1, text, decorations: [], scopes: [], mermaidBlocks: [], mathRegions: [] }),
    invalidate: () => {},
    clear: () => {},
  };
  const decorator = new Decorator(parseCache as any);
  (decorator as unknown as { activeEditor: unknown }).activeEditor = editor;
  return decorator;
}

describe('Decorator selection-change coalescing', () => {
  it('runs immediately on the first change and coalesces a rapid burst into one trailing pass', () => {
    vi.useFakeTimers();
    const decorator = makeDecorator();
    const onApply = vi.fn();
    decorator.onApply = onApply;

    // A held arrow key delivers a stream of selection events with no gaps.
    decorator.onSelectionChange();
    decorator.onSelectionChange();
    decorator.onSelectionChange();

    expect(onApply).toHaveBeenCalledTimes(1); // leading edge only; intermediates queued

    vi.advanceTimersByTime(16); // cooldown elapses -> single trailing pass at latest position

    expect(onApply).toHaveBeenCalledTimes(2); // 3 events -> 2 passes, not 3

    decorator.dispose();
    vi.useRealTimers();
  });

  it('does not run the decoration pass for non-markdown editors', () => {
    vi.useFakeTimers();
    const decorator = makeDecorator('plaintext');
    const onApply = vi.fn();
    decorator.onApply = onApply;

    decorator.onSelectionChange();
    vi.advanceTimersByTime(100);

    expect(onApply).not.toHaveBeenCalled();

    decorator.dispose();
    vi.useRealTimers();
  });
});

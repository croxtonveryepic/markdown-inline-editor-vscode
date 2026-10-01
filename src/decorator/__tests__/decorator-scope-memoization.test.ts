vi.mock('../../parser', () => ({
  MarkdownParser: class {
    extractDecorations() {
      return [];
    }
  },
}));

import * as applier from '../editor-decoration-applier';
import { Decorator } from '../../decorator';
import { TextDocument, TextEditor, Selection, Position, Uri } from '../../test/__mocks__/vscode';

function makeFixture() {
  const text = '# Title\n\nsome **bold** text\n';
  const document = new TextDocument(Uri.file('test.md'), 'markdown', 1, text);
  const editor = new TextEditor(document, [new Selection(new Position(0, 0), new Position(0, 0))]);
  const scopes = [{ startPos: 12, endPos: 20, kind: 'emphasis' }];
  const parseCache = {
    get: (doc: { version: number; getText(): string }) => ({
      version: doc.version,
      text: doc.getText(),
      decorations: [],
      scopes,
      mermaidBlocks: [],
      mathRegions: [],
    }),
    invalidate: () => {},
    clear: () => {},
  };
  const decorator = new Decorator(parseCache as any);
  (decorator as unknown as { activeEditor: unknown }).activeEditor = editor;
  return { decorator, document, editor, parseCache };
}

describe('Decorator scope-entry memoization', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('builds scope entries once per document version across repeated selection passes', () => {
    const { decorator } = makeFixture();
    const buildSpy = vi.spyOn(applier, 'buildScopeEntries');

    // A held arrow key drives many selection passes at the same document version.
    decorator.updateDecorationsForSelection();
    decorator.updateDecorationsForSelection();
    decorator.updateDecorationsForSelection();

    expect(buildSpy).toHaveBeenCalledTimes(1);

    decorator.dispose();
  });

  it('rebuilds scope entries when the document version changes', () => {
    const { decorator, document } = makeFixture();
    const buildSpy = vi.spyOn(applier, 'buildScopeEntries');

    decorator.updateDecorationsForSelection();
    expect(buildSpy).toHaveBeenCalledTimes(1);

    // An edit bumps the version, which must invalidate the memoized entries.
    (document as unknown as { version: number }).version = 2;
    decorator.updateDecorationsForSelection();

    expect(buildSpy).toHaveBeenCalledTimes(2);

    decorator.dispose();
  });

  it('rebuilds scope entries for a reopened document with the same URI and version', () => {
    const { decorator, document } = makeFixture();
    const buildSpy = vi.spyOn(applier, 'buildScopeEntries');
    decorator.updateDecorationsForSelection();

    const reopened = new TextDocument(document.uri, 'markdown', document.version, '# A longer title\n\nsome **bold** text\n');
    const editor = new TextEditor(reopened, [new Selection(new Position(0, 0), new Position(0, 0))]);
    decorator.setActiveEditor(editor);
    decorator.updateDecorationsForSelection();

    expect(buildSpy).toHaveBeenCalledTimes(2);
    expect(buildSpy).toHaveBeenLastCalledWith(editor, expect.any(Array), reopened.getText());
    decorator.dispose();
  });

  it.each([undefined, 'file://test.md'])('rebuilds scope entries after clearing cache for %s', (uri) => {
    const { decorator, parseCache } = makeFixture();
    const clearSpy = vi.spyOn(parseCache, 'clear');
    const buildSpy = vi.spyOn(applier, 'buildScopeEntries');
    decorator.updateDecorationsForSelection();

    decorator.clearCache(uri);
    decorator.updateDecorationsForSelection();

    expect(clearSpy).toHaveBeenCalledWith(uri);
    expect(buildSpy).toHaveBeenCalledTimes(2);
    decorator.dispose();
  });

  it('keeps scope entries when clearing another document', () => {
    const { decorator } = makeFixture();
    const buildSpy = vi.spyOn(applier, 'buildScopeEntries');
    decorator.updateDecorationsForSelection();

    decorator.clearCache('file://another.md');
    decorator.updateDecorationsForSelection();

    expect(buildSpy).toHaveBeenCalledTimes(1);
    decorator.dispose();
  });

  it('rebuilds scope entries when the parsed scopes are replaced at the same version', () => {
    const { decorator, parseCache } = makeFixture();
    const buildSpy = vi.spyOn(applier, 'buildScopeEntries');
    decorator.updateDecorationsForSelection();
    const entry = parseCache.get(decorator.activeEditor!.document);
    vi.spyOn(parseCache, 'get').mockReturnValue({ ...entry, scopes: [] });

    decorator.updateDecorationsForSelection();

    expect(buildSpy).toHaveBeenCalledTimes(2);
    expect(buildSpy).toHaveBeenLastCalledWith(decorator.activeEditor, [], entry.text);
    decorator.dispose();
  });

  it('releases the active editor when no editor remains', () => {
    const { decorator } = makeFixture();

    decorator.setActiveEditor(undefined);

    expect(decorator.activeEditor).toBeUndefined();
    decorator.dispose();
  });
});

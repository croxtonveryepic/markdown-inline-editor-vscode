vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  watchFile: vi.fn(),
  unwatchFile: vi.fn(),
}));

import { readFileSync, watchFile, unwatchFile } from 'node:fs';
import { join } from 'node:path';
import { commands, type ExtensionContext } from 'vscode';
import { registerLocalDeploymentReload } from '../../local-deployment-reload';

const context = { globalStorageUri: { fsPath: '/storage' } } as Pick<ExtensionContext, 'globalStorageUri'>;
const signalPath = join('/storage', 'local-deployment.json');

function signal(revision: string) {
  vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ enabled: true, revision }));
}

function notify() {
  const callback = vi.mocked(watchFile).mock.calls[0][2] as () => void;
  callback();
}

describe('local deployment reload', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(commands.executeCommand).mockResolvedValue(undefined);
  });

  it('does not watch or reload when the deployment signal is absent', () => {
    vi.mocked(readFileSync).mockImplementation(() => { throw new Error('ENOENT'); });

    expect(registerLocalDeploymentReload(context)).toBeUndefined();
    expect(watchFile).not.toHaveBeenCalled();
    expect(commands.executeCommand).not.toHaveBeenCalled();
  });

  it.each(['invalid JSON', '{}', '{"enabled":false,"revision":"a"}', '{"enabled":true,"revision":""}'])('ignores an invalid initial signal: %s', (value) => {
    vi.mocked(readFileSync).mockReturnValue(value);

    expect(registerLocalDeploymentReload(context)).toBeUndefined();
    expect(watchFile).not.toHaveBeenCalled();
  });

  it('reloads once when an enabled deployment revision changes', () => {
    signal('first');
    const disposable = registerLocalDeploymentReload(context);
    expect(commands.executeCommand).not.toHaveBeenCalled();
    expect(watchFile).toHaveBeenCalledWith(signalPath, { interval: 1000, persistent: false }, expect.any(Function));
    notify();
    expect(commands.executeCommand).not.toHaveBeenCalled();

    signal('second');
    notify();
    notify();

    expect(commands.executeCommand).toHaveBeenCalledExactlyOnceWith('workbench.action.reloadWindow');
    disposable?.dispose();
  });

  it('ignores incomplete writes and disabled signals until a valid deployment arrives', () => {
    signal('first');
    const disposable = registerLocalDeploymentReload(context);
    vi.mocked(readFileSync).mockReturnValue('{');
    notify();
    vi.mocked(readFileSync).mockReturnValue('{"enabled":false,"revision":"second"}');
    notify();
    expect(commands.executeCommand).not.toHaveBeenCalled();

    signal('second');
    notify();
    expect(commands.executeCommand).toHaveBeenCalledOnce();
    disposable?.dispose();
  });

  it('unwatches on disposal and ignores queued notifications', () => {
    signal('first');
    const disposable = registerLocalDeploymentReload(context);
    disposable?.dispose();

    expect(unwatchFile).toHaveBeenCalledWith(signalPath, vi.mocked(watchFile).mock.calls[0][2]);
    signal('second');
    notify();
    expect(commands.executeCommand).not.toHaveBeenCalled();
  });

  it('allows another deployment notification after a reload command fails', async () => {
    signal('first');
    const disposable = registerLocalDeploymentReload(context);
    vi.mocked(commands.executeCommand).mockRejectedValueOnce(new Error('reload failed'));
    signal('second');
    notify();
    await Promise.resolve();
    notify();

    expect(commands.executeCommand).toHaveBeenCalledTimes(2);
    disposable?.dispose();
  });
});

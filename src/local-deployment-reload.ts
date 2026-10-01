import { readFileSync, watchFile, unwatchFile } from 'node:fs';
import { join } from 'node:path';
import { commands, type Disposable, type ExtensionContext } from 'vscode';
import { logWarn } from './logging';

interface DeploymentSignal {
  enabled: true;
  revision: string;
}

function readSignal(signalPath: string): DeploymentSignal | undefined {
  try {
    const signal: unknown = JSON.parse(readFileSync(signalPath, 'utf8'));
    if (typeof signal === 'object' && signal !== null &&
        'enabled' in signal && signal.enabled === true &&
        'revision' in signal && typeof signal.revision === 'string' && signal.revision.length > 0) {
      return signal as DeploymentSignal;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

/** Watches the opt-in deployment signal described in docs/local-deployment.md. */
export function registerLocalDeploymentReload(context: Pick<ExtensionContext, 'globalStorageUri'>): Disposable | undefined {
  const signalPath = join(context.globalStorageUri.fsPath, 'local-deployment.json');
  const initialSignal = readSignal(signalPath);
  if (!initialSignal) {
    return undefined;
  }

  let reloading = false;
  let disposed = false;
  const onChange = () => {
    if (disposed || reloading) return;
    const signal = readSignal(signalPath);
    if (!signal || signal.revision === initialSignal.revision) return;
    reloading = true;
    void Promise.resolve(commands.executeCommand('workbench.action.reloadWindow')).catch((error: unknown) => {
      reloading = false;
      logWarn('Could not reload after local deployment', error);
    });
  };
  watchFile(signalPath, { interval: 1000, persistent: false }, onChange);
  return {
    dispose() {
      disposed = true;
      unwatchFile(signalPath, onChange);
    },
  };
}

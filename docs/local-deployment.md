# Local deployment

Run `npm run deploy-local` from Windows to test, lint, build, and install this checkout into both Windows VS Code and the `Ubuntu-24.04` WSL VS Code server. The script locates the server matching the Windows VS Code commit, supports both server directory layouts, and verifies that the installed JavaScript bundles have the same SHA-256 hash as the new build. It does not publish to a marketplace, change the package version, or stage files.

The targets are the default Stable VS Code profile on Windows and the default `~/.vscode-server/extensions` installation in the selected WSL distribution. Custom profiles, Insiders, and other remote hosts are outside this command's scope. Windows must have `code.cmd`, `npm.cmd`, and `wsl.exe` on PATH, and WSL must have Python 3. Open a VS Code window connected to the distro at least once after updating VS Code so the matching WSL server exists.

To check the deployment prerequisites without building or installing anything, run `npm run deploy-local -- -Check`. To select another distro, run `npm run deploy-local -- -Distro <name>`.

## Automatic reload

After both installations have been verified, deployment atomically writes a new revision to `local-deployment.json` in the extension's global storage on each target. On Windows that is `%APPDATA%/Code/User/globalStorage/codesmith.markdown-inline-editor-vscode`; in WSL it is `~/.vscode-server/data/User/globalStorage/codesmith.markdown-inline-editor-vscode`. The signal contains `enabled: true` and a revision string. The extension watches this file only when a valid enabled signal already exists at activation, and reloads its window when the revision changes. Other installations have no watcher.

After the first deployment, run **Developer: Reload Window** once in each Windows and WSL window to activate this watcher. Subsequent deployments refresh windows where the extension is active automatically. A window where the extension has not activated will use the installed build on its next activation. Reloading uses VS Code's normal window reload and session restoration; deployment does not kill VS Code processes. Remove the signal file or set `enabled` to `false`, then reload, to disable the watcher.

## Agent workflow

For Jonathan's local extension updates, deployment is part of finishing the work. After completing a runtime change, run `npm run deploy-local` and report installation verification for both targets. The command runs tests, lint, and the full build before installing, and stops on failure. Run the repository's required `npm run validate` separately; if its documentation check fails on unchanged existing files, report that failure and proceed with deployment when tests, lint, and build pass. Do not deploy midway through a change.

The build copies Mermaid assets into the working tree. Preserve any existing asset edits and the Git index; clean up only incidental asset changes produced by your build when those files were clean beforehand.

"""WSL deployment helper; see docs/local-deployment.md."""

import argparse
import hashlib
import json
from pathlib import Path
import subprocess


def find_server(commit: str) -> Path:
    server_root = Path.home() / ".vscode-server"
    candidates = [
        server_root / "bin" / commit / "bin" / "code-server",
        server_root / "cli" / "servers" / f"Stable-{commit}" / "server" / "bin" / "code-server",
    ]
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    raise RuntimeError("Open a VS Code window connected to this WSL distro once to install the matching server, then retry deployment.")


def install(args: argparse.Namespace) -> None:
    server = find_server(args.commit)
    vsix = Path(args.vsix)
    if not vsix.is_file():
        raise RuntimeError(f"VSIX does not exist: {vsix}")
    extension_root = Path.home() / ".vscode-server" / "extensions"
    subprocess.run([str(server), "--extensions-dir", str(extension_root), "--install-extension", str(vsix), "--force"], check=True)
    candidates = list(extension_root.glob(f"{args.extension_id}-{args.version}*"))
    for candidate in candidates:
        manifest_path = candidate / "package.json"
        bundle_path = candidate / "dist" / "extension.js"
        if not manifest_path.is_file() or not bundle_path.is_file():
            continue
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        extension_id = f"{manifest.get('publisher')}.{manifest.get('name')}".lower()
        digest = hashlib.sha256(bundle_path.read_bytes()).hexdigest()
        if extension_id == args.extension_id and manifest.get("version") == args.version and digest == args.sha256:
            print(f"Verified WSL bundle: {bundle_path}")
            return
    raise RuntimeError("WSL installation does not match the newly built extension.")


def write_signal(args: argparse.Namespace) -> None:
    storage = Path.home() / ".vscode-server" / "data" / "User" / "globalStorage" / args.extension_id
    storage.mkdir(parents=True, exist_ok=True)
    temporary = storage / f"local-deployment.{args.revision}.tmp"
    temporary.write_text(json.dumps({"enabled": True, "revision": args.revision}), encoding="utf-8")
    temporary.replace(storage / "local-deployment.json")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    actions = parser.add_subparsers(dest="action", required=True)
    check = actions.add_parser("check")
    check.add_argument("--commit", required=True)
    deploy = actions.add_parser("install")
    for option in ("commit", "vsix", "extension-id", "version", "sha256"):
        deploy.add_argument(f"--{option}", required=True)
    signal = actions.add_parser("signal")
    signal.add_argument("--extension-id", required=True)
    signal.add_argument("--revision", required=True)
    args = parser.parse_args()
    if args.action == "check":
        print(f"WSL server ready: {find_server(args.commit)}")
    elif args.action == "install":
        install(args)
    else:
        write_signal(args)


if __name__ == "__main__":
    main()

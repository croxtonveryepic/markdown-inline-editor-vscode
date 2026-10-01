param(
    [string]$Distro = 'Ubuntu-24.04',
    [switch]$Check
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$CodeCommand = (Get-Command code.cmd -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
$NpmCommand = (Get-Command npm.cmd -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
$WslCommand = (Get-Command wsl.exe -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
$Package = Get-Content -LiteralPath (Join-Path $ProjectRoot 'package.json') -Raw | ConvertFrom-Json
$ExtensionId = "$($Package.publisher).$($Package.name)".ToLowerInvariant()
$VsixPath = Join-Path $ProjectRoot 'dist/extension.vsix'

function Assert-ExitCode([string]$Operation) {
    if ($LASTEXITCODE -ne 0) {
        throw "$Operation failed (exit code $LASTEXITCODE)."
    }
}

function Convert-ToWslPath([string]$WindowsPath) {
    $Converted = & $WslCommand --distribution $Distro --exec wslpath -u $WindowsPath
    Assert-ExitCode 'WSL path conversion'
    return ($Converted | Out-String).Trim()
}

function Get-BundleHash([string]$BundlePath) {
    $HashAlgorithm = [System.Security.Cryptography.SHA256]::Create()
    $BundleStream = [System.IO.File]::OpenRead($BundlePath)
    try {
        return [System.BitConverter]::ToString($HashAlgorithm.ComputeHash($BundleStream)).Replace('-', '').ToLowerInvariant()
    } finally {
        $BundleStream.Dispose()
        $HashAlgorithm.Dispose()
    }
}

$CodeVersion = @(& $CodeCommand --version)
Assert-ExitCode 'Reading VS Code version'
$CodeCommit = ($CodeVersion | Where-Object { $_ -match '^[0-9a-f]{40}$' } | Select-Object -First 1)
if (!$CodeCommit) {
    throw 'Could not determine the installed Windows VS Code commit.'
}
$WslHelper = Convert-ToWslPath (Join-Path $PSScriptRoot 'deploy-wsl.py')
$WslVsix = Convert-ToWslPath $VsixPath
& $WslCommand --distribution $Distro --exec python3 $WslHelper check --commit $CodeCommit
Assert-ExitCode 'WSL deployment preflight'
if ($Check) {
    Write-Host "Deployment preflight passed for Windows and $Distro."
    exit 0
}

Push-Location $ProjectRoot
try {
    & $NpmCommand test
    Assert-ExitCode 'Tests'
    & $NpmCommand run lint
    Assert-ExitCode 'Lint'
    & $NpmCommand run build
    Assert-ExitCode 'Build'

    $ExpectedHash = Get-BundleHash (Join-Path $ProjectRoot 'dist/extension.js')
    Write-Host 'Installing the build into Windows VS Code...'
    & $CodeCommand --install-extension $VsixPath --force
    Assert-ExitCode 'Windows installation'
    $InstalledPath = (& $CodeCommand --locate-extension $ExtensionId | Out-String).Trim()
    Assert-ExitCode 'Locating the Windows extension'
    if (!$InstalledPath) {
        throw 'Windows VS Code did not locate the installed extension.'
    }
    $InstalledPackage = Get-Content -LiteralPath (Join-Path $InstalledPath 'package.json') -Raw | ConvertFrom-Json
    $InstalledHash = Get-BundleHash (Join-Path $InstalledPath 'dist/extension.js')
    if ($InstalledPackage.version -ne $Package.version -or $InstalledHash -ne $ExpectedHash) {
        throw 'Windows installation does not match the newly built extension.'
    }

    Write-Host "Installing the build into WSL ($Distro)..."
    & $WslCommand --distribution $Distro --exec python3 $WslHelper install --commit $CodeCommit --vsix $WslVsix --extension-id $ExtensionId --version $Package.version --sha256 $ExpectedHash
    Assert-ExitCode 'WSL installation'

    # docs/local-deployment.md: signal only after both installed bundles have been verified.
    $Revision = [guid]::NewGuid().ToString()
    $StoragePath = Join-Path $env:APPDATA "Code/User/globalStorage/$ExtensionId"
    [System.IO.Directory]::CreateDirectory($StoragePath) | Out-Null
    $SignalPath = Join-Path $StoragePath 'local-deployment.json'
    $TemporarySignal = Join-Path $StoragePath "local-deployment.$Revision.tmp"
    $Signal = @{ enabled = $true; revision = $Revision } | ConvertTo-Json -Compress
    [System.IO.File]::WriteAllText($TemporarySignal, $Signal, [System.Text.UTF8Encoding]::new($false))
    Move-Item -LiteralPath $TemporarySignal -Destination $SignalPath -Force
    & $WslCommand --distribution $Distro --exec python3 $WslHelper signal --extension-id $ExtensionId --revision $Revision
    Assert-ExitCode 'WSL reload signal'
    Write-Host "Deployed $ExtensionId@$($Package.version) to Windows and $Distro; both installed bundles match the build."
    Write-Host 'Reload-enabled windows will refresh automatically. On first setup, reload each window once to activate the watcher.'
} finally {
    Pop-Location
}

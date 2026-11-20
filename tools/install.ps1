[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory)][string]$DotaRoot,
    [switch]$FromBuild
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$DotaRoot = (Resolve-Path -LiteralPath $DotaRoot).Path
if (!(Test-Path -LiteralPath (Join-Path $DotaRoot 'game\bin\win64\dota2.exe'))) {
    throw 'DotaRoot must point to dota 2 beta.'
}
$project = Join-Path $repo 'content\_project'
if ($FromBuild -and !(Test-Path -LiteralPath (Join-Path $project 'build\game\scripts\vscripts\addon_game_mode.lua'))) {
    throw 'Run npm.cmd run check in content\_project first.'
}
$pairs = @(
    @{Source=(Join-Path $repo 'content'); Target=(Join-Path $DotaRoot 'content\dota_addons\orbthrow')},
    @{Source=(Join-Path $repo 'game'); Target=(Join-Path $DotaRoot 'game\dota_addons\orbthrow')}
)
if ($FromBuild) {
    $pairs += @{Source=(Join-Path $project 'build\content\panorama'); Target=(Join-Path $DotaRoot 'content\dota_addons\orbthrow\panorama')}
    $pairs += @{Source=(Join-Path $project 'build\game'); Target=(Join-Path $DotaRoot 'game\dota_addons\orbthrow')}
}
if (!$PSCmdlet.ShouldProcess($DotaRoot, 'Back up and install Orbthrow')) { return }
$backup = Join-Path $repo ('work\install-backup-' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff'))
function Copy-Tree([string]$Source, [string]$Target) {
    & robocopy $Source $Target /E /XD node_modules .git build .backups .sim _deploy /XF *.log tools_asset_info.bin tools_thumbnail_cache.sqlite3 /NJH /NJS /NFL /NDL
    if ($LASTEXITCODE -ge 8) { throw "Copy failed: $Source" }
}
foreach ($name in @('content', 'game')) {
    $live = Join-Path $DotaRoot "$name\dota_addons\orbthrow"
    if (Test-Path -LiteralPath $live) { Copy-Tree $live (Join-Path $backup $name) }
}
foreach ($pair in $pairs) { Copy-Tree $pair.Source $pair.Target }
# Verify final overlays first so older snapshot files are not compared against rebuilt output.
$seen = @{}
$checked = 0
for ($i=$pairs.Count-1; $i -ge 0; $i--) {
    $pair = $pairs[$i]
    foreach ($file in Get-ChildItem -LiteralPath $pair.Source -File -Recurse) {
        $relative = $file.FullName.Substring($pair.Source.Length+1)
        if ($relative -match '(^|\\)(node_modules|\.git|build|\.backups|\.sim|_deploy)(\\|$)' -or $file.Name -like '*.log' -or $file.Name -in @('tools_asset_info.bin','tools_thumbnail_cache.sqlite3')) { continue }
        $target = Join-Path $pair.Target $relative
        if ($seen.ContainsKey($target)) { continue }
        $seen[$target] = $true
        if ((Get-FileHash -LiteralPath $file.FullName).Hash -ne (Get-FileHash -LiteralPath $target).Hash) { throw "Hash mismatch: $target" }
        $checked++
    }
}
if ($FromBuild) {
    $compiler = Join-Path $DotaRoot 'game\bin\win64\resourcecompiler.exe'
    $log = Join-Path $backup 'compile.log'
    New-Item -ItemType Directory -Force -Path $backup | Out-Null
    Push-Location (Split-Path $compiler)
    try {
        & $compiler -r -i (Join-Path $DotaRoot 'content\dota_addons\orbthrow\panorama\*') *> $log
        if ($LASTEXITCODE -ne 0 -or (Select-String -LiteralPath $log -Pattern '\b[1-9][0-9]* failed')) { throw "Panorama compilation failed: $log" }
    } finally { Pop-Location }
}
Write-Output "Installed. Verified files: $checked. Backup: $backup"

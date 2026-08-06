#requires -version 5.1
[CmdletBinding()]
param(
    [int]$Year = 2026,
    [int]$SkipMonth = 2,
    [string]$OutputRoot = '',
    [string]$Magick = 'C:\Program Files\ImageMagick-7.1.2-Q16-HDRI\magick.exe',
    [string]$Tesseract = 'C:\Program Files\Tesseract-OCR\tesseract.exe',
    [string]$TessDataDir = '',
    [switch]$RunRedFallback
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if (-not $OutputRoot) { $OutputRoot = Join-Path $PSScriptRoot 'ocr-zones' }
if (-not $TessDataDir) { $TessDataDir = Join-Path $PSScriptRoot 'tessdata' }
if (-not (Test-Path -LiteralPath $Magick)) { throw "ImageMagick not found: $Magick" }
if (-not (Test-Path -LiteralPath $Tesseract)) { throw "Tesseract not found: $Tesseract" }

function Write-Utf8([string]$Path, [string]$Content) {
    [IO.File]::WriteAllText($Path, $Content, (New-Object Text.UTF8Encoding($false)))
}

function Get-Paksha([string]$Text) {
    foreach ($value in @('ಶುಕ್ಲ', 'ಶುಕ್ಹ', 'ಶುಕ್ಕ್ಶ್ಣ', 'ಶುಕ್ಕ್ಶ್ಷ್ಣ', 'ಶುಕ್ಷ', 'ಶುಕ್ಚ', 'ಶುಕ್ಬ್ಚ', 'ಶುಕ್ಬ್ಪ')) {
        if ($Text.Contains($value)) { return 'ಶುಕ್ಲ' }
    }
    foreach ($value in @('ಕೃಷ್ಣ', 'ಕ್ರಿಷ್ಣ', 'ಕಷ್ಣ', 'ಕೃಷ್ಟ')) {
        if ($Text.Contains($value)) { return 'ಕೃಷ್ಣ' }
    }
    return $null
}

$scanned = 0
$recovered = 0
$skipped = 0
$failed = @()

foreach ($dir in [IO.Directory]::GetDirectories($OutputRoot)) {
    $date = Split-Path $dir -Leaf
    if ($date -notmatch '^\d{2}-\d{2}-' + $Year + '$') { continue }
    if ([int]$date.Substring(3, 2) -eq $SkipMonth) { $skipped++; continue }

    $jsonPath = Join-Path $dir 'structured-ocr.json'
    $crop = Join-Path $dir 'bottom_table_2-row-06.png'
    if (-not (Test-Path -LiteralPath $jsonPath) -or -not (Test-Path -LiteralPath $crop)) { continue }

    $json = Get-Content -LiteralPath $jsonPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($null -ne $json.content.panchanga.paksha) { continue }
    $scanned++

    try {
        $value = $null
        $raw = $null
        foreach ($candidateFile in @('bottom_table_2-row-06-psm13.txt', 'paksha-red-fallback-psm7.txt')) {
            $candidatePath = Join-Path $dir $candidateFile
            if (-not (Test-Path -LiteralPath $candidatePath)) { continue }
            $candidateRaw = [IO.File]::ReadAllText($candidatePath, [Text.Encoding]::UTF8).Trim()
            $candidateValue = Get-Paksha $candidateRaw
            if ($candidateValue) { $value = $candidateValue; $raw = $candidateRaw; break }
        }

        if ($value) {
            $json.content.panchanga.paksha = $value
            $json.ocr | Add-Member -Force NoteProperty pakshaFallback ([ordered]@{
                method = 'existing-paksha-ocr'
                raw = $raw
                value = $value
            })
            Write-Utf8 $jsonPath ($json | ConvertTo-Json -Depth 20)
            $recovered++
            continue
        }

        if (-not $RunRedFallback) { continue }
        $red = Join-Path $dir 'paksha-red-fallback.png'
        & $Magick $crop -resize '400%' -channel R -separate -auto-level $red 2>$null
        if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $red)) { throw 'red-channel preprocessing failed' }

        $base = Join-Path $dir 'paksha-red-fallback-psm7'
        $previous = $ErrorActionPreference
        try {
            $ErrorActionPreference = 'Continue'
            & $Tesseract $red $base --tessdata-dir $TessDataDir -l kan --psm 7 2>$null
            $exitCode = $LASTEXITCODE
        }
        finally { $ErrorActionPreference = $previous }
        if ($exitCode -ne 0 -and -not (Test-Path -LiteralPath ($base + '.txt'))) { throw 'Tesseract failed' }

        $raw = [IO.File]::ReadAllText(($base + '.txt'), [Text.Encoding]::UTF8).Trim()
        $value = Get-Paksha $raw
        if ($value) {
            $json.content.panchanga.paksha = $value
            $json.ocr | Add-Member -Force NoteProperty pakshaFallback ([ordered]@{
                method = 'red-channel-4x-psm7'
                raw = $raw
                value = $value
            })
            Write-Utf8 $jsonPath ($json | ConvertTo-Json -Depth 20)
            $recovered++
        }
    }
    catch {
        $failed += $date
    }
}

Write-Host ('Scanned: {0}  Recovered: {1}  Unresolved: {2}  Skipped month {3}: {4}  Failed: {5}' -f $scanned, $recovered, ($scanned - $recovered), $SkipMonth, $skipped, $failed.Count)
if ($failed.Count) { Write-Host ('Failed: ' + ($failed -join ', ')) }

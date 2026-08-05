#requires -version 5.1
<#
.SYNOPSIS
Batch OCR of Kannada calendar images using the frozen zones from ocr-zones.md.

.DESCRIPTION
For every image data\{Year}\{MM}\{DD-MM-YYYY}.jpg in the requested month, crops the
frozen OCR zones, runs Tesseract (lang kan, local tessdata) and writes, under
ocr-zones\{DD-MM-YYYY}\:
  - zone crops (*.png) and raw OCR text (*.txt)
  - ocr-results.json        (per-zone x/y/width/height/text, general --psm 6)
  - jathaka-rows-psm13.json (per-row crop metadata + text, --psm 13)
  - structured-ocr.json     (named fields where reliably parseable, null otherwise)

Missing image dates are skipped and reported in the summary.

.EXAMPLE
.\ocr_month.ps1
.\ocr_month.ps1 -Year 2026 -Month 5
.\ocr_month.ps1 -Year 2026 -Month 8 -OnlyDate 05-08-2026
#>
[CmdletBinding()]
param(
    [int]$Year = 2026,
    [int]$Month = 8,
    [string]$OnlyDate = '',
    [string]$DataRoot = '',
    [string]$OutputRoot = '',
    [string]$Magick = 'C:\Program Files\ImageMagick-7.1.2-Q16-HDRI\magick.exe',
    [string]$Tesseract = 'C:\Program Files\Tesseract-OCR\tesseract.exe',
    [string]$TessDataDir = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# $PSScriptRoot is not populated in param-block defaults on PS 5.1, resolve here
if (-not $DataRoot)   { $DataRoot   = Join-Path $PSScriptRoot 'data' }
if (-not $OutputRoot) { $OutputRoot = Join-Path $PSScriptRoot 'ocr-zones' }
if (-not $TessDataDir){ $TessDataDir = Join-Path $PSScriptRoot 'tessdata' }

if ($Year -lt 1 -or $Year -gt 9999) { throw "Year out of range: $Year" }
if ($Month -lt 1 -or $Month -gt 12) { throw "Month out of range: $Month" }
if (-not (Test-Path -LiteralPath $Magick)) { throw "ImageMagick not found: $Magick" }
if (-not (Test-Path -LiteralPath $Tesseract)) { throw "Tesseract not found: $Tesseract" }
if (-not (Test-Path -LiteralPath (Join-Path $TessDataDir 'kan.traineddata'))) {
    throw "kan.traineddata not found under $TessDataDir"
}
if ($OnlyDate -and ($OnlyDate -notmatch '^\d{2}-\d{2}-\d{4}$')) { throw "OnlyDate must look like DD-MM-YYYY: $OnlyDate" }

# --- frozen zones (ocr-zones.md) -------------------------------------------------
$zones = @(
    [pscustomobject]@{ Name = 'quote';          X = 327; Y = 129; W = 684; H = 59 },
    [pscustomobject]@{ Name = 'date_left';      X = 7;   Y = 199; W = 317; H = 204 },
    [pscustomobject]@{ Name = 'date_right_1';   X = 648; Y = 199; W = 262; H = 60 },
    [pscustomobject]@{ Name = 'date_right_2';   X = 648; Y = 271; W = 264; H = 126 },
    [pscustomobject]@{ Name = 'events';         X = 1;   Y = 409; W = 921; H = 223 },
    [pscustomobject]@{ Name = 'bottom_table_1'; X = 305; Y = 639; W = 242; H = 248 },
    [pscustomobject]@{ Name = 'bottom_table_2'; X = 553; Y = 636; W = 366; H = 248 },
    [pscustomobject]@{ Name = 'bottom_table_3'; X = 310; Y = 891; W = 609; H = 34 }
)
$jathakaPanel = [pscustomobject]@{ Name = 'jathaka'; X = 928; Y = 253; W = 390; H = 614 }
$jathakaX = 928
$jathakaW = 390
# row boundaries (top 253, then bottoms); 8px vertical overlap applied below
$jathakaBoundaries = @(253, 298, 360, 395, 456, 505, 562, 610, 667, 712, 756, 820, 867)

$monthDir = Join-Path $DataRoot ('{0}\{1:00}' -f $Year, $Month)

function Read-Utf8([string]$Path) {
    [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8)
}
function Write-Utf8([string]$Path, [string]$Content) {
    [System.IO.File]::WriteAllText($Path, $Content, (New-Object System.Text.UTF8Encoding($false)))
}
function Invoke-Crop([string]$Image, [string]$OutPng, [int]$X, [int]$Y, [int]$W, [int]$H) {
    & $Magick $Image -crop ('{0}x{1}+{2}+{3}' -f $W, $H, $X, $Y) +repage $OutPng 2>$null
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $OutPng)) { throw "crop failed: $OutPng" }
}
function Invoke-Ocr([string]$Png, [string]$OutBase, [int]$Psm) {
    $previousErrorAction = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        & $Tesseract $Png $OutBase --tessdata-dir $TessDataDir -l kan --psm $Psm 2>$null
        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousErrorAction
    }
    if ($exitCode -ne 0 -and -not (Test-Path -LiteralPath ($OutBase + '.txt'))) { throw "tesseract failed: $OutBase" }
    return Read-Utf8 ($OutBase + '.txt')
}
function Normalize-EndTime([string]$Raw) {
    $value = ($Raw -replace ',', '.').Trim()
    if ($value -match '^(?<h>[0-9]{1,2})[.](?<m>[0-9]{1,2})$') {
        if ([int]$Matches['h'] -gt 23 -or [int]$Matches['m'] -gt 59) { return $null }
        return $value
    }
    if ($value -match '^(?<h>[0-9]{2})(?<m>[0-9]{2})$') {
        if ([int]$Matches['h'] -gt 23 -or [int]$Matches['m'] -gt 59) { return $null }
        return $value.Substring(0, 2) + '.' + $value.Substring(2, 2)
    }
    if ($value -match '^(?<h>[0-9])(?<m>[0-9]{2})$') {
        if ([int]$Matches['h'] -gt 9 -or [int]$Matches['m'] -gt 59) { return $null }
        return '0' + $value.Substring(0, 1) + '.' + $value.Substring(1, 2)
    }
    return $null
}

function Get-NameTime([string]$Text, [string]$LabelPattern) {
    foreach ($line in ($Text -split '\r?\n')) {
        $line = $line.Trim()
        if (-not $line -or $line -notmatch $LabelPattern) { continue }
        $rest = [regex]::Replace($line, '^.*?' + $LabelPattern + '\s*[:.]?\s*', '')
        if (-not $rest) { continue }

        $full = [regex]::Match($rest, '^(?<n>.+?)\s*ಪೂರ್ಣ[\s.]*$')
        if ($full.Success) {
            return [pscustomobject]@{ name = $full.Groups['n'].Value.Trim(); endsAt = $null; fullDay = $true }
        }

        $timed = [regex]::Match($rest, '^(?<n>.+?)(?<t>[0-9]{1,2}[.,][0-9]{1,2}|[0-9]{3,4})\s*$')
        if ($timed.Success) {
            $name = ($timed.Groups['n'].Value -replace '^[\s_:.\"]+', '' -replace '[\s_:.\"]+$', '').Trim()
            $time = Normalize-EndTime $timed.Groups['t'].Value
            if ($name -and $time) {
                return [pscustomobject]@{ name = $name; endsAt = $time; fullDay = $false }
            }
        }

        $name = ($rest -replace '^[\s_:.\"]+', '' -replace '[\s_:.\"]+$', '').Trim()
        if ($name) { return [pscustomobject]@{ name = $name; endsAt = $null; fullDay = $false } }
    }
    return $null
}

function Normalize-ClockTime([string]$Raw) {
    $value = ($Raw -replace '\s', '').Trim()
    if ($value -match '^[0-9]{1,2}:[0-9]{2}$') { return $value }
    if ($value -match '^[0-9]{4}$') { return $value.Substring(0, 2) + ':' + $value.Substring(2, 2) }
    return $null
}

function Get-BottomRowText([System.Collections.IDictionary]$BottomRows, [string]$Key, [string]$Fallback) {
    if ($BottomRows -and $BottomRows.Contains($Key) -and -not [string]::IsNullOrWhiteSpace($BottomRows[$Key].text)) {
        return $BottomRows[$Key].text.Trim()
    }
    return $Fallback
}

function Get-BestNameTime([string]$RowText, [string]$FullText, [string]$LabelPattern) {
    $candidate = Get-NameTime $RowText $LabelPattern
    if ($candidate -and ($candidate.fullDay -or $candidate.endsAt)) { return $candidate }
    return Get-NameTime $FullText $LabelPattern
}

function Get-FirstMatchValue([string[]]$Texts, [string]$Pattern) {
    foreach ($text in $Texts) {
        $m = [regex]::Match($text, $Pattern)
        if ($m.Success) { return $m.Groups['v'].Value }
    }
    return $null
}

function Get-BestTiming([string]$RowText, [string]$FullText, [string]$LabelPattern) {
    foreach ($text in @($RowText, $FullText)) {
        $m = [regex]::Match($text, $LabelPattern + '\s*(?<v>.+)')
        if ($m.Success -and $m.Groups['v'].Value -match '[0-9]') { return $m.Groups['v'].Value.Trim() }
    }
    return $null
}

function Scale-Zone([object]$Zone, [double]$Scale) {
    return [pscustomobject]@{
        Name = $Zone.Name
        X = [Math]::Max(0, [int][Math]::Round($Zone.X * $Scale))
        Y = [Math]::Max(0, [int][Math]::Round($Zone.Y * $Scale))
        W = [Math]::Max(1, [int][Math]::Round($Zone.W * $Scale))
        H = [Math]::Max(1, [int][Math]::Round($Zone.H * $Scale))
    }
}

function New-StructuredJson {
    param([string]$Date, [string]$Image, [int]$DimWidth, [int]$DimHeight,
          [System.Collections.IDictionary]$Results, [System.Collections.IDictionary]$Rows,
          [System.Collections.IDictionary]$BottomRows)

    $quoteText = if ([string]::IsNullOrWhiteSpace($Results['quote'].text)) { $null } else { $Results['quote'].text.Trim() }

    # --- calendar ----------------------------------------------------------
    $dlLines = @($Results['date_left'].text -split '\r?\n' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
    $months = @(); $samvatsara = $null; $shakaYear = $null; $monthDone = $false
    foreach ($ln in $dlLines) {
        if ($ln -match 'ಸಂವತ್ಸರ') {
            $samvatsara = (($ln -replace '\s*ಸಂವತ್ಸರ\s*$', '')).Trim()
        }
        elseif ($ln -match 'ಶಕೆ\s*(?<y>[0-9]+)') {
            $parsedShaka = 0
            if ([int]::TryParse($Matches['y'], [ref]$parsedShaka)) { $shakaYear = $parsedShaka }
        }
        elseif (-not $monthDone) {
            $months = @($ln -split '\s*[-–—]\s*' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
            $monthDone = $true
        }
    }
    $headerRashi = if ([string]::IsNullOrWhiteSpace($Results['date_right_1'].text)) { $null } else { $Results['date_right_1'].text.Trim() }
    $sunrise = $null; $sunset = $null
    $m = [regex]::Match($Results['date_right_2'].text, 'ಸೂರ್ಯೋದಯ\s*[:.]?\s*(?<t>[0-9]{1,2}:[0-9]{2}|[0-9]{4})')
    if ($m.Success) { $sunrise = Normalize-ClockTime $m.Groups['t'].Value }
    $m = [regex]::Match($Results['date_right_2'].text, 'ಸೂರ್ಯಾಸ್ತ\s*[:.]?\s*(?<t>[0-9]{1,2}:[0-9]{2}|[0-9]{4})')
    if ($m.Success) { $sunset = Normalize-ClockTime $m.Groups['t'].Value }

    # --- events -------------------------------------------------------------
    $events = @()
    foreach ($line in ($Results['events'].text -split '\r?\n')) {
        foreach ($part in ($line -split ',')) {
            $p = $part.Trim()
            if ($p) { $events += $p }
        }
    }

    # --- panchanga -----------------------------------------------------------
    $bt1 = $Results['bottom_table_1'].text
    $bt2 = $Results['bottom_table_2'].text
    $bt3 = $Results['bottom_table_3'].text
    $bt1N = Get-BottomRowText $BottomRows 'bottom_table_1-row-01' $bt1
    $bt1T = Get-BottomRowText $BottomRows 'bottom_table_1-row-02' $bt1
    $bt1Y = Get-BottomRowText $BottomRows 'bottom_table_1-row-03' $bt1
    $bt1K = Get-BottomRowText $BottomRows 'bottom_table_1-row-04' $bt1
    $bt1A = Get-BottomRowText $BottomRows 'bottom_table_1-row-05' $bt1
    $bt1R = Get-BottomRowText $BottomRows 'bottom_table_1-row-06' $bt1
    $bt1S = Get-BottomRowText $BottomRows 'bottom_table_1-row-07' $bt1
    $bt2Ra = Get-BottomRowText $BottomRows 'bottom_table_2-row-01' $bt2
    $bt2Gu = Get-BottomRowText $BottomRows 'bottom_table_2-row-02' $bt2
    $bt2Ya = Get-BottomRowText $BottomRows 'bottom_table_2-row-03' $bt2
    $bt2Ar = Get-BottomRowText $BottomRows 'bottom_table_2-row-04' $bt2
    $bt2Sh = Get-BottomRowText $BottomRows 'bottom_table_2-row-05' $bt2
    $bt2Pa = Get-BottomRowText $BottomRows 'bottom_table_2-row-06' $bt2
    $bt2So = Get-BottomRowText $BottomRows 'bottom_table_2-row-07' $bt2
    $panchanga = [ordered]@{}
    $panchanga['nakshatra'] = Get-BestNameTime $bt1N $bt1 '(?:ನಕ್ಷತ್ರ|ನಕ್ಚತ್ರ)'
    $panchanga['tithi']     = Get-BestNameTime $bt1T $bt1 '(?:ತಿಥಿ|ತಥಿ)'
    $panchanga['yoga']      = Get-BestNameTime $bt1Y $bt1 '(?:ಯೋಗ|ಹೋಗ)'
    $karana = Get-BestNameTime $bt1K $bt1 '(?:ಕರಣ|ರಣ)'
    if ($karana) {
        $panchanga['karana'] = [ordered]@{ name = $karana.name; endsAt = $karana.endsAt; fullDay = $karana.fullDay; raw = $bt1K.Trim() }
    } else {
        $panchanga['karana'] = $null
    }
    $panchanga['ayana'] = Get-FirstMatchValue @($bt1A, $bt1) '(?<v>ದಕ್ಷಿಣಾಯನ|ಉತ್ತರಾಯಣ)'
    $panchanga['ritu'] = Get-FirstMatchValue @($bt1R, $bt1) '(?:ಋತು|ಖುತು|ಹುತು|ರಿತು|ರತು)\s*(?<v>.+)'
    $solarRaw = Get-FirstMatchValue @($bt1S, $bt1) 'ಸೌರ[^\r\n0-9]*?(?<v>[0-9]{1,4})'; $solarYear = $null
    $parsedSolar = 0
    if ($solarRaw -and [int]::TryParse($solarRaw, [ref]$parsedSolar) -and $parsedSolar -ge 1 -and $parsedSolar -le 366) { $solarYear = $parsedSolar }
    $panchanga['solarYear'] = $solarYear
    $paksha = Get-FirstMatchValue @($bt2Pa, $bt2) 'ಪಕ್ಷ\s*(?<v>ಕೃಷ್ಣ|ಕ್ರಿಷ್ಣ|ಶುಕ್ಲ|ಬಹುಳ|ಶುದ್ಧ|ಶುಕ್ಹ)'
    if ($paksha -eq 'ಶುಕ್ಹ') { $paksha = 'ಶುಕ್ಲ' }; $panchanga['paksha'] = $paksha
    $panchanga['solarRashi'] = Get-FirstMatchValue @($bt2So, $bt2) 'ಸೂರ್ಯ\s*ನ?\s*ರಾಶಿ\s*(?<v>\S+)'
    $m = [regex]::Match($bt3, 'ಪ್ರವೇಶ\s*(?<v>\S+)');          $panchanga['chandraEntryRashi'] = if ($m.Success) { $m.Groups['v'].Value } else { $null }

    # --- timings -------------------------------------------------------------
    $timings = [ordered]@{}
    $timeRows = @(
        @('rahuKala', $bt2Ra, 'ರಾಹುಕಾಲ'),
        @('gulikaKala', $bt2Gu, 'ಗುಳಿಕಕಾಲ'),
        @('yamaganda', $bt2Ya, 'ಯಮಗಂಡ'),
        @('arthaPrahara', $bt2Ar, '(?:ಅರ್ಥ|ಅರ್ಧ)\s*(?:ಪ್ರಹರ|ಪ್ರಹಕ)'),
        @('shubhaSamaya', $bt2Sh, 'ಶುಭಸಮಯ')
    )
    foreach ($t in $timeRows) {
        $timings[$t[0]] = Get-BestTiming $t[1] $bt2 $t[2]
    }

    # --- jathaka ---------------------------------------------------------------
    $rashiNames = @('ಮೇಷ', 'ವೃಷಭ', 'ಮಿಥುನ', 'ಕರ್ಕಾಟಕ', 'ಸಿಂಹ', 'ಕನ್ಯಾ',
                    'ತುಲಾ', 'ವೃಶ್ಚಿಕ', 'ಧನಸ್ಸು', 'ಮಕರ', 'ಕುಂಭ', 'ಮೀನ')
    $jathaka = @()
    for ($i = 1; $i -le 12; $i++) {
        $key = 'jathaka-row-{0:00}' -f $i
        $raw = $Rows[$key].text.Trim()
        $rashi = $null; $rest = $raw
        if ($raw) {
            $expected = $rashiNames[$i - 1]
            if ($raw.StartsWith($expected)) {
                $rashi = $expected
                $rest = $raw.Substring($expected.Length)
            } else {
                foreach ($r in $rashiNames) {
                    $idx = $raw.IndexOf($r)
                    if ($idx -ge 0) { $rashi = $r; $rest = $raw.Substring($idx + $r.Length); break }
                }
                if (-not $rashi -and $raw.StartsWith($expected.Substring(0, [Math]::Min(3, $expected.Length)))) {
                    $rashi = $expected
                    $rest = $raw.Substring([Math]::Min(3, $expected.Length))
                }
            }
        }
        $prediction = $null
        if ($rashi) {
            $clean = $rest -replace '^[\s»:."''0-9\u0CE6-\u0CFF,]+', ''
            $clean = $clean -replace '[\s»:."''0-9\u0CE6-\u0CFF,]+$', ''
            $clean = ($clean -replace '\s+', ' ').Trim()
            if ($clean -match '[»:.]\s*(?<p>\S+)\s*$') { $clean = $Matches['p'] }
            if ($clean) { $prediction = $clean }
        }
        $jathaka += [ordered]@{ row = $i; rashi = $rashi; prediction = $prediction; raw = $raw }
    }

    # --- assembly ----------------------------------------------------------------
    $rel = $Image
    $rootPrefix = $PSScriptRoot.TrimEnd('\') + '\'
    if ($Image.StartsWith($rootPrefix)) { $rel = $Image.Substring($rootPrefix.Length) }

    return [ordered]@{
        source = [ordered]@{
            image      = $rel
            date       = $Date
            dimensions = [ordered]@{ width = $DimWidth; height = $DimHeight }
        }
        ocr = [ordered]@{
            language = 'kan'
            jathaka  = [ordered]@{
                pageSegmentationMode = 13
                horizontalRange      = @(928, 1318)
                verticalOverlapPx    = 8
            }
            bottomTables = [ordered]@{
                rowCount = 7
                verticalOverlapPx = 6
                scale = 2
                pageSegmentationMode = 13
            }
        }
        content = [ordered]@{
            header = [ordered]@{ date = $Date; quote = $quoteText }
            calendar = [ordered]@{
                months     = $months
                samvatsara = $samvatsara
                shakaYear  = $shakaYear
                rashi      = $headerRashi
                sunrise    = $sunrise
                sunset     = $sunset
            }
            events   = $events
            panchanga = $panchanga
            timings   = $timings
            jathaka   = $jathaka
        }
    }
}

# --- main ---------------------------------------------------------------------
$allDates = @(1..[DateTime]::DaysInMonth($Year, $Month) |
    ForEach-Object { '{0:00}-{1:00}-{2}' -f $_, $Month, $Year })
if ($OnlyDate) {
    if ($allDates -notcontains $OnlyDate) { throw "OnlyDate not in requested month: $OnlyDate" }
    $dates = @($OnlyDate)
} else {
    $dates = $allDates
}

$processed = @(); $missing = @(); $failed = @()

foreach ($date in $dates) {
    $img = Join-Path $monthDir ($date + '.jpg')
    if (-not (Test-Path -LiteralPath $img)) { $missing += $date; continue }

    $outDir = Join-Path $OutputRoot $date
    New-Item -ItemType Directory -Path $outDir -Force | Out-Null

    try {
        $dim = (& $Magick identify -format '%w %h' $img 2>$null).Trim()
        if (-not $dim) { throw 'image identify returned no dimensions' }
        $dw, $dh = $dim -split ' '
        $layoutScale = [Math]::Min(([double]$dw / 1325.0), ([double]$dh / 928.0))

        $results = [ordered]@{}
        foreach ($z in ($zones | ForEach-Object { Scale-Zone $_ $layoutScale })) {
            $png = Join-Path $outDir ($z.Name + '.png')
            Invoke-Crop $img $png $z.X $z.Y $z.W $z.H
            $txt = Invoke-Ocr $png (Join-Path $outDir $z.Name) 6
            $results[$z.Name] = [ordered]@{ x = $z.X; y = $z.Y; width = $z.W; height = $z.H; text = $txt.Trim() }
        }

        $scaledJathakaPanel = Scale-Zone $jathakaPanel $layoutScale
        $jpng = Join-Path $outDir 'jathaka.png'
        Invoke-Crop $img $jpng $scaledJathakaPanel.X $scaledJathakaPanel.Y $scaledJathakaPanel.W $scaledJathakaPanel.H
        $jtxt = Invoke-Ocr $jpng (Join-Path $outDir 'jathaka') 6
        $results['jathaka'] = [ordered]@{
            x = $scaledJathakaPanel.X; y = $scaledJathakaPanel.Y; width = $scaledJathakaPanel.W; height = $scaledJathakaPanel.H; text = $jtxt.Trim()
        }

        $rows = [ordered]@{}
        $scaledJathakaX = [int][Math]::Round($jathakaX * $layoutScale)
        $scaledJathakaW = [int][Math]::Round($jathakaW * $layoutScale)
        $scaledJathakaBoundaries = @($jathakaBoundaries | ForEach-Object { [int][Math]::Round($_ * $layoutScale) })
        for ($i = 0; $i -lt ($scaledJathakaBoundaries.Count - 1); $i++) {
            $top = $scaledJathakaBoundaries[$i] - $(if ($i -eq 0) { 0 } else { [int][Math]::Round(8 * $layoutScale) })
            $bot = $scaledJathakaBoundaries[$i + 1] + [int][Math]::Round(8 * $layoutScale)
            $rn  = '{0:00}' -f ($i + 1)
            $rpng = Join-Path $outDir ("jathaka-row-$rn.png")
            Invoke-Crop $img $rpng $scaledJathakaX $top $scaledJathakaW ($bot - $top)
            $rtxt = Invoke-Ocr $rpng (Join-Path $outDir "jathaka-row-$rn-psm13") 13
            $rows["jathaka-row-$rn"] = [ordered]@{ row = ($i + 1); x = $scaledJathakaX; y = $top; width = $scaledJathakaW; height = ($bot - $top); text = $rtxt.Trim() }
        }

        $bottomTables = @(
            [pscustomobject]@{ Name = 'bottom_table_1'; X = 305; Y = 639; W = 242; H = 248; Labels = @('nakshatra','tithi','yoga','karana','ayana','ritu','solarYear') },
            [pscustomobject]@{ Name = 'bottom_table_2'; X = 553; Y = 636; W = 366; H = 248; Labels = @('rahuKala','gulikaKala','yamaganda','arthaPrahara','shubhaSamaya','paksha','solarRashi') }
        )
        $bottomRows = [ordered]@{}
        foreach ($table in $bottomTables) {
            $scaledTable = Scale-Zone $table $layoutScale
            for ($i = 0; $i -lt 7; $i++) {
                $top = [int][Math]::Floor($scaledTable.Y + ($scaledTable.H * $i / 7))
                $bot = [int][Math]::Ceiling($scaledTable.Y + ($scaledTable.H * ($i + 1) / 7))
                $overlap = [int][Math]::Round(6 * $layoutScale)
                if ($i -gt 0) { $top = [Math]::Max($scaledTable.Y, $top - $overlap) }
                if ($i -lt 6) { $bot = [Math]::Min($scaledTable.Y + $scaledTable.H, $bot + $overlap) }
                $rn = '{0:00}' -f ($i + 1)
                $name = "$($table.Name)-row-$rn"
                $png = Join-Path $outDir ($name + '.png')
                Invoke-Crop $img $png $scaledTable.X $top $scaledTable.W ($bot - $top)
                $scaled = Join-Path $outDir ($name + '-x2.png')
                & $Magick $png -resize '200%' $scaled 2>$null
                if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $scaled)) { throw "upscale failed: $name" }
                $txt = Invoke-Ocr $scaled (Join-Path $outDir ($name + '-psm13')) 13
                $bottomRows[$name] = [ordered]@{
                    table = $table.Name; row = ($i + 1); label = $table.Labels[$i]
                    x = $scaledTable.X; y = $top; width = $scaledTable.W; height = ($bot - $top)
                    overlapPx = $overlap; scale = 2; pageSegmentationMode = 13; text = $txt.Trim()
                }
            }
        }

        Write-Utf8 (Join-Path $outDir 'ocr-results.json') ($results | ConvertTo-Json -Depth 10)
        Write-Utf8 (Join-Path $outDir 'jathaka-rows-psm13.json') ($rows | ConvertTo-Json -Depth 10)
        Write-Utf8 (Join-Path $outDir 'bottom-table-rows-psm13.json') ($bottomRows | ConvertTo-Json -Depth 10)
        $structured = New-StructuredJson -Date $date -Image $img -DimWidth ([int]$dw) -DimHeight ([int]$dh) -Results $results -Rows $rows -BottomRows $bottomRows
        Write-Utf8 (Join-Path $outDir 'structured-ocr.json') ($structured | ConvertTo-Json -Depth 20)

        $processed += $date
        Write-Host ('OK  {0}  ({1}x{2})' -f $date, $dw, $dh)
    }
    catch {
        $failed += $date
        Write-Host ("ERR {0}: {1}" -f $date, $_.Exception.Message) -ForegroundColor Red
    }
}

Write-Host ''
Write-Host ('Processed: {0}   Missing: {1}   Failed: {2}' -f $processed.Count, $missing.Count, $failed.Count)
if ($missing.Count) { Write-Host ('Missing: ' + ($missing -join ', ')) }
if ($failed.Count)  { Write-Host ('Failed:  ' + ($failed -join ', ')) }

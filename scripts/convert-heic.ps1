Add-Type -AssemblyName PresentationCore

$root = Split-Path -Parent $PSScriptRoot
$manifestPath = Join-Path $root ".build\media-manifest.json"
$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
$items = $manifest | Where-Object { $_.kind -eq 'heic' }

$maxWidth = 1600
$ok = 0
$fail = 0
$i = 0

foreach ($item in $items) {
    $i++
    $src = $item.src
    $dest = Join-Path $root $item.dest
    $destDir = Split-Path -Parent $dest

    try {
        if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Force -Path $destDir | Out-Null }

        $uri = New-Object System.Uri($src)
        $decoder = [System.Windows.Media.Imaging.BitmapDecoder]::Create($uri, [System.Windows.Media.Imaging.BitmapCreateOptions]::None, [System.Windows.Media.Imaging.BitmapCacheOption]::OnLoad)
        $frame = $decoder.Frames[0]

        $orientation = 1
        try {
            $o = $frame.Metadata.GetQuery('System.Photo.Orientation')
            if ($o) { $orientation = [int]$o }
        } catch {}

        $rotation = 0
        switch ($orientation) {
            3 { $rotation = 180 }
            6 { $rotation = 90 }
            8 { $rotation = 270 }
            default { $rotation = 0 }
        }

        $working = $frame
        if ($rotation -ne 0) {
            $rt = New-Object System.Windows.Media.RotateTransform($rotation)
            $working = New-Object System.Windows.Media.Imaging.TransformedBitmap($working, $rt)
        }

        if ($working.PixelWidth -gt $maxWidth) {
            $scale = $maxWidth / $working.PixelWidth
            $st = New-Object System.Windows.Media.ScaleTransform($scale, $scale)
            $working = New-Object System.Windows.Media.Imaging.TransformedBitmap($working, $st)
        }

        $encoder = New-Object System.Windows.Media.Imaging.JpegBitmapEncoder
        $encoder.QualityLevel = 82
        $encoder.Frames.Add([System.Windows.Media.Imaging.BitmapFrame]::Create($working))

        $fs = [System.IO.File]::Open($dest, [System.IO.FileMode]::Create)
        try {
            $encoder.Save($fs)
        } finally {
            $fs.Close()
        }
        $ok++
    } catch {
        $fail++
        Write-Output "FAIL: $src -- $($_.Exception.Message)"
    }

    if ($i % 50 -eq 0) { Write-Output "...$i/$($items.Count)" }
}

Write-Output "Done. ok=$ok fail=$fail total=$($items.Count)"

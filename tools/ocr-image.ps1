$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Runtime.WindowsRuntime

$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Media.Ocr.OcrEngine, Windows.Media.Ocr, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime]

$imagePath = $args[0]
if (-not $imagePath) {
  throw "Image path is required."
}

$fileOp = [Windows.Storage.StorageFile]::GetFileFromPathAsync($imagePath)
$file = [System.WindowsRuntimeSystemExtensions]::AsTask[Windows.Storage.StorageFile]($fileOp).GetAwaiter().GetResult()

$streamOp = $file.OpenAsync([Windows.Storage.FileAccessMode]::Read)
$stream = [System.WindowsRuntimeSystemExtensions]::AsTask[Windows.Storage.Streams.IRandomAccessStream]($streamOp).GetAwaiter().GetResult()

$decoderOp = [Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)
$decoder = [System.WindowsRuntimeSystemExtensions]::AsTask[Windows.Graphics.Imaging.BitmapDecoder]($decoderOp).GetAwaiter().GetResult()

$bitmapOp = $decoder.GetSoftwareBitmapAsync()
$bitmap = [System.WindowsRuntimeSystemExtensions]::AsTask[Windows.Graphics.Imaging.SoftwareBitmap]($bitmapOp).GetAwaiter().GetResult()
$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
$ocrOp = $engine.RecognizeAsync($bitmap)
$result = [System.WindowsRuntimeSystemExtensions]::AsTask[Windows.Media.Ocr.OcrResult]($ocrOp).GetAwaiter().GetResult()
$result.Text

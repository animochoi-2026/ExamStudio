param([Parameter(Mandatory=$true)][string]$Plan)
$ErrorActionPreference = 'Stop'
$taskDir = Split-Path -Parent ([IO.Path]::GetFullPath($Plan))
$config = Get-Content -LiteralPath $Plan -Raw -Encoding UTF8 | ConvertFrom-Json
$installRoot = [IO.Path]::GetFullPath($config.root).TrimEnd('\')
$staging = Join-Path $taskDir 'unpacked'
$backup = Join-Path $taskDir 'backup'
$moved = @()
$installed = @()
$names = @('locales','resources','runtime/python','runtime/codex','문제공방.exe','chrome_100_percent.pak','chrome_200_percent.pak','d3dcompiler_47.dll','dxcompiler.dll','dxil.dll','ffmpeg.dll','icudtl.dat','LICENSE','LICENSES.chromium.html','resources.pak','snapshot_blob.bin','START-HERE.txt','v8_context_snapshot.bin','version','vk_swiftshader_icd.json','vk_swiftshader.dll','vulkan-1.dll')
function SafePath([string]$base,[string]$relative) {
 $full = [IO.Path]::GetFullPath((Join-Path $base $relative))
 if (!$full.StartsWith($base.TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe update path' }
 return $full
}
function NoLinks([string]$target) {
 $current = $target
 while ($current -and (Test-Path -LiteralPath $current)) {
  if ((Get-Item -LiteralPath $current -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Linked update paths are not supported' }
  $parent = Split-Path -Parent $current
  if ($parent -eq $current) { break }; $current = $parent
 }
}
try {
 if ($installRoot -eq [IO.Path]::GetPathRoot($installRoot).TrimEnd('\')) { throw 'Invalid installation folder' }
 NoLinks $installRoot; NoLinks $taskDir
 $oldExe = Join-Path $installRoot '문제공방.exe'
 if (!(Test-Path -LiteralPath $oldExe)) { $oldExe = Join-Path $installRoot 'ExamStudio.exe' }
 if (!(Test-Path -LiteralPath $oldExe)) { throw 'Existing application not found' }
 $digest = [Security.Cryptography.SHA256]::Create(); $zipStream = [IO.File]::OpenRead($config.zip)
 try { $actualHash = [BitConverter]::ToString($digest.ComputeHash($zipStream)).Replace('-','').ToLowerInvariant() } finally { $zipStream.Dispose(); $digest.Dispose() }
 if ($actualHash -ne $config.sha256) { throw 'Update checksum mismatch' }
 Add-Type -AssemblyName System.IO.Compression.FileSystem
 $archive = [IO.Compression.ZipFile]::OpenRead($config.zip)
 try {
  $seen = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
  $expanded = 0L
  foreach ($entry in $archive.Entries) {
   $name = $entry.FullName.Replace('\','/')
   if ($name.EndsWith('/')) { continue }
   if ($name.Contains(':') -or $name -match '(^|/)\.{1,2}(/|$)' -or $name.StartsWith('/') -or !$seen.Add($name)) { throw 'Unsafe or duplicate ZIP entry' }
   $allowed = $false
   foreach ($item in $names) { if ($name -ceq $item -or (@('locales','resources','runtime/python','runtime/codex') -contains $item -and $name.StartsWith($item+'/'))) { $allowed=$true; break } }
   if (!$allowed -or $name -match '(^|/)(data|\.git|\.env|\.codex-remote-attachments)(/|$)') { throw "Unexpected update entry: $name" }
   $expanded += $entry.Length; if ($expanded -gt 6000000000) { throw 'Update archive is too large' }
   $out = SafePath $staging $name
   [IO.Directory]::CreateDirectory((Split-Path -Parent $out)) | Out-Null
   [IO.Compression.ZipFileExtensions]::ExtractToFile($entry,$out,$false)
  }
 } finally { $archive.Dispose() }
 $package = Get-Content -LiteralPath (Join-Path $staging 'resources/app/package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
 if ($package.name -ne 'geometry-exam-studio' -or $package.version -ne $config.version -or !(Test-Path -LiteralPath (Join-Path $staging '문제공방.exe')) -or !(Test-Path -LiteralPath (Join-Path $staging 'runtime/python/python.exe'))) { throw 'Incomplete update package' }
 # Wait for the requesting instance; never kill another process or touch data.
 $requester = Get-Process -Id $config.parentPid -ErrorAction SilentlyContinue
 if ($requester) { if (!$requester.WaitForExit(180000)) { throw 'Application is still running; update cancelled' } }
 [IO.Directory]::CreateDirectory($backup) | Out-Null
 foreach ($name in $names) {
  $source=SafePath $staging $name; if (!(Test-Path -LiteralPath $source)) { continue }
  $target=SafePath $installRoot $name; $saved=SafePath $backup $name
  NoLinks (Split-Path -Parent $target); NoLinks $target
  if (Test-Path -LiteralPath $target) { [IO.Directory]::CreateDirectory((Split-Path -Parent $saved)) | Out-Null; Move-Item -LiteralPath $target -Destination $saved; $moved += $name }
  [IO.Directory]::CreateDirectory((Split-Path -Parent $target)) | Out-Null
  Move-Item -LiteralPath $source -Destination $target; $installed += $name
 }
 @{status='installed';version=$config.version;backup=$backup} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $taskDir 'result.json') -Encoding UTF8
 if ($config.restart) { Start-Process -FilePath (Join-Path $installRoot '문제공방.exe') -WorkingDirectory $installRoot -WindowStyle Hidden }
} catch {
 $failure = $_.Exception.Message
 foreach ($name in $installed) { $target=SafePath $installRoot $name; $failed=SafePath (Join-Path $taskDir 'failed') $name; [IO.Directory]::CreateDirectory((Split-Path -Parent $failed)) | Out-Null; if (Test-Path -LiteralPath $target) { Move-Item -LiteralPath $target -Destination $failed } }
 foreach ($name in $moved) { $saved=SafePath $backup $name; $target=SafePath $installRoot $name; Move-Item -LiteralPath $saved -Destination $target }
 @{status='failed';error=$failure} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $taskDir 'result.json') -Encoding UTF8
 if ($config.restart) { Add-Type -AssemblyName System.Windows.Forms; [Windows.Forms.MessageBox]::Show("업데이트하지 못했습니다. 기존 파일을 보존했습니다.`n$failure`n$taskDir",'문제공방 업데이트') | Out-Null }
 exit 1
}

param(
    [Parameter(Mandatory=$true)][string]$Source,
    [Parameter(Mandatory=$true)][string]$Destination,
    [Parameter(Mandatory=$true)][string]$ExpectedHash
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
try {
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class ExamQueueNativeMove {
    [DllImport("kernel32.dll", EntryPoint="MoveFileExW", CharSet=CharSet.Unicode, ExactSpelling=true, SetLastError=true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool MoveFileEx(string source, string destination, uint flags);
    public static int RenameWithoutReplaceOrCopy(string source, string destination) {
        if (MoveFileEx(source, destination, 0)) return 0;
        return Marshal.GetLastWin32Error();
    }
}
'@
    $moveSource = [IO.Path]::GetFullPath($Source)
    $moveDestination = [IO.Path]::GetFullPath($Destination)
    $hashStream = [IO.File]::OpenRead($moveSource)
    $hashAlgorithm = [Security.Cryptography.SHA256]::Create()
    try { $actualHash = [BitConverter]::ToString($hashAlgorithm.ComputeHash($hashStream)).Replace('-','').ToLowerInvariant() }
    finally { $hashStream.Dispose(); $hashAlgorithm.Dispose() }
    if ($actualHash -ne $ExpectedHash) {
        $packet = @{ok=$false; hashMismatch=$true; operation='MoveFileExW'; flags=0}
    } else {
        # Flags=0: never replace an existing destination, copy across volumes, or defer deletion.
        $errorCode = [ExamQueueNativeMove]::RenameWithoutReplaceOrCopy($moveSource,$moveDestination)
        $packet = @{ok=($errorCode -eq 0); win32Code=$errorCode; operation='MoveFileExW'; flags=0}
    }
} catch {
    $packet = @{ok=$false; setupError=$true; message=$_.Exception.Message; operation='MoveFileExW'; flags=0}
}
[Console]::Write(($packet | ConvertTo-Json -Compress))

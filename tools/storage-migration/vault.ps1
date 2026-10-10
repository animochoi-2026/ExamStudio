param(
  [ValidateSet('Initialize','Status','Set','SetR2','SetRuntimeR2','RuntimeCheck','Audit','Run','Publish','ClientProbe','SourceInspect','SourceDownload','LocalIntegration')][string]$Action='Status',
  [string]$Name,
  [ValidateSet('preflight','test','copy','verify','restore-plan','restore-copy','restore-verify')][string]$Operation='preflight',
  [string]$Confirmation=''
)
$ErrorActionPreference='Stop'
$vaultDir=Join-Path $env:LOCALAPPDATA 'ExamStudio\R2Preparation'
$vaultFile=Join-Path $vaultDir 'secrets.clixml'
$allowed=@('R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','R2_RUNTIME_ACCESS_KEY_ID','R2_RUNTIME_SECRET_ACCESS_KEY','MIGRATION_STATE_KEY','SUPABASE_ACCESS_TOKEN','SUPABASE_READ_KEY','SOURCE_S3_ACCESS_KEY_ID','SOURCE_S3_SECRET_ACCESS_KEY','SUPABASE_RESTORE_KEY')
if($Action -eq 'Initialize'){
  if(Test-Path -LiteralPath $vaultFile){Write-Output 'Vault exists; preserved.';exit}
  New-Item -ItemType Directory -Path $vaultDir -Force | Out-Null
  $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User
  $acl=New-Object Security.AccessControl.DirectorySecurity
  $acl.SetOwner($sid);$acl.SetAccessRuleProtection($true,$false)
  $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow')))
  Set-Acl -LiteralPath $vaultDir -AclObject $acl
  $random=New-Object byte[] 32
  $rng=[Security.Cryptography.RandomNumberGenerator]::Create();$rng.GetBytes($random);$rng.Dispose()
  $key=([BitConverter]::ToString($random)).Replace('-','').ToLowerInvariant()
  @{MIGRATION_STATE_KEY=(ConvertTo-SecureString -String $key -AsPlainText -Force)} | Export-Clixml -LiteralPath $vaultFile
  $key=$null;[Array]::Clear($random,0,$random.Length)
  Write-Output 'Created Windows CurrentUser DPAPI vault; MIGRATION_STATE_KEY initialized.';exit
}
if(!(Test-Path -LiteralPath $vaultFile)){throw 'VAULT_NOT_INITIALIZED'}
$secrets=Import-Clixml -LiteralPath $vaultFile
if($Action -eq 'Status'){$secrets.Keys | Sort-Object;exit}
if($Action -in @('SetR2','SetRuntimeR2')){
  $Host.UI.RawUI.WindowTitle='ExamStudio R2 - secure key entry'
  $keyNames=@('R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY')
  if($Action -eq 'SetRuntimeR2'){$keyNames=@('R2_RUNTIME_ACCESS_KEY_ID','R2_RUNTIME_SECRET_ACCESS_KEY');$Host.UI.RawUI.WindowTitle='ExamStudio R2 runtime - secure key entry'}
  foreach($keyName in $keyNames){if($secrets.ContainsKey($keyName)){throw 'EXISTING_SECRET_PRESERVED'}}
  Write-Host 'Copy Access Key ID, then Secret Access Key from the Cloudflare result page.'
  Write-Host 'Do NOT enter the API Token value. Input is hidden; no plaintext file is written.'
  $newKeys=@{}
  foreach($keyName in $keyNames){
    $newKeys[$keyName]=Read-Host -Prompt "Paste $keyName, then Enter" -AsSecureString
    if($newKeys[$keyName].Length -lt 16){throw 'KEY_INPUT_TOO_SHORT_NOT_SAVED'}
  }
  # Re-read before saving so unrelated additions made during user input survive.
  $secrets=Import-Clixml -LiteralPath $vaultFile
  foreach($keyName in $keyNames){if($secrets.ContainsKey($keyName)){throw 'EXISTING_SECRET_PRESERVED'}}
  foreach($keyName in $keyNames){$secrets[$keyName]=$newKeys[$keyName]}
  $secrets | Export-Clixml -LiteralPath $vaultFile
  Write-Host 'Both R2 keys saved in Windows CurrentUser DPAPI vault. You may close this window.'
  Read-Host 'Press Enter to close' | Out-Null
  exit
}
if($Action -eq 'Set'){
  if($allowed -notcontains $Name){throw 'SECRET_NAME_NOT_ALLOWED'}
  if($secrets.ContainsKey($Name)){throw 'EXISTING_SECRET_PRESERVED'}
  $Host.UI.RawUI.WindowTitle='ExamStudio - secure credential entry'
  $value=Read-Host -Prompt "Enter $Name (hidden, never paste into chat)" -AsSecureString
  if($value.Length -lt 16){throw 'KEY_INPUT_TOO_SHORT_NOT_SAVED'}
  $secrets=Import-Clixml -LiteralPath $vaultFile
  if($secrets.ContainsKey($Name)){throw 'EXISTING_SECRET_PRESERVED'}
  $secrets[$Name]=$value
  $secrets | Export-Clixml -LiteralPath $vaultFile
  Write-Output "Saved $Name in Windows DPAPI vault.";exit
}
# Decrypted values exist only in this process and its trusted child environment.
# No plaintext .env, command-line arguments, transcripts, or secret output.
$previous=@{}
try{
  foreach($entry in $secrets.GetEnumerator()){
    if($allowed -notcontains $entry.Key){throw 'UNEXPECTED_VAULT_KEY'}
    $previous[$entry.Key]=[Environment]::GetEnvironmentVariable($entry.Key,'Process')
    $ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($entry.Value)
    try{[Environment]::SetEnvironmentVariable($entry.Key,[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr),'Process')}
    finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)}
  }
  if($Action -eq 'Publish'){& node (Join-Path $PSScriptRoot 'github-prepare.mjs')}
  elseif($Action -eq 'ClientProbe'){& node (Join-Path $PSScriptRoot 'live-client-probe.mjs')}
  elseif($Action -eq 'SourceInspect'){& node (Join-Path $PSScriptRoot 'source-inspect.mjs')}
  elseif($Action -eq 'SourceDownload'){& node (Join-Path $PSScriptRoot 'source-download.mjs')}
  elseif($Action -eq 'LocalIntegration'){& node (Join-Path $PSScriptRoot 'local-integration.mjs')}
  elseif($Action -eq 'RuntimeCheck'){& node (Join-Path $PSScriptRoot 'runtime-key-check.mjs')}
  elseif($Action -eq 'Audit'){& node (Join-Path $PSScriptRoot 'audit-candidate.mjs')}
  else{& node (Join-Path $PSScriptRoot 'cli.mjs') $Operation $Confirmation}
  if($LASTEXITCODE -ne 0){throw 'PREPARATION_COMMAND_FAILED'}
}finally{foreach($keyName in $previous.Keys){[Environment]::SetEnvironmentVariable($keyName,$previous[$keyName],'Process')}}

[CmdletBinding()]
param()

$taskExecutable = Join-Path $PSScriptRoot '..\release\LocalOps-Guardian-0.1.0-x64.exe'
$taskExecutable = [System.IO.Path]::GetFullPath($taskExecutable)

if (-not (Test-Path -LiteralPath $taskExecutable -PathType Leaf)) {
  throw "Packaged LocalOps executable not found. Run npm run package:desktop first."
}

$taskPreviousMode = $env:LOCALOPS_ENABLE_SSH
try {
  $env:LOCALOPS_ENABLE_SSH = '1'
  $taskProcess = Start-Process -FilePath $taskExecutable -PassThru
  [pscustomobject]@{
    ProcessId = $taskProcess.Id
    Mode = 'ssh-enabled'
    Executable = $taskExecutable
  } | ConvertTo-Json -Compress
}
finally {
  if ($null -eq $taskPreviousMode) {
    Remove-Item Env:LOCALOPS_ENABLE_SSH -ErrorAction SilentlyContinue
  }
  else {
    $env:LOCALOPS_ENABLE_SSH = $taskPreviousMode
  }
}

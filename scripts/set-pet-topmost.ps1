param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("LocalOps Guardian")]
  [string]$WindowTitle,

  [Parameter(Mandatory = $true)]
  [ValidateSet("true", "false")]
  [string]$Topmost
)

$ErrorActionPreference = "Stop"
$petProcesses = @()
for ($attempt = 0; $attempt -lt 20; $attempt += 1) {
  $petProcesses = @(Get-Process -Name "msedge" -ErrorAction SilentlyContinue | Where-Object {
    $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -ceq $WindowTitle
  })
  if ($petProcesses.Count -eq 1) { break }
  Start-Sleep -Milliseconds 100
}

if ($petProcesses.Count -ne 1) {
  [Console]::Error.WriteLine("Expected one LocalOps Edge pet window; found $($petProcesses.Count).")
  exit 2
}

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class LocalOpsWindowPosition {
  [DllImport("user32.dll", SetLastError = true)]
  public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int x, int y, int cx, int cy, uint flags);
}
"@

$topmostEnabled = $Topmost -eq "true"
$insertAfter = if ($topmostEnabled) { [IntPtr](-1) } else { [IntPtr](-2) }
$flags = 0x0001 -bor 0x0002 -bor 0x0010
$changed = [LocalOpsWindowPosition]::SetWindowPos($petProcesses[0].MainWindowHandle, $insertAfter, 0, 0, 0, 0, $flags)
if (-not $changed) {
  [Console]::Error.WriteLine("Windows did not accept the LocalOps pet window position change.")
  exit 3
}

[Console]::Out.WriteLine((@{ title = $WindowTitle; topmost = $topmostEnabled } | ConvertTo-Json -Compress))

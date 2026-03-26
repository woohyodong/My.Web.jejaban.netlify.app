Add-Type -AssemblyName System.Runtime.WindowsRuntime
[System.WindowsRuntimeSystemExtensions].GetMethods() |
  Where-Object { $_.Name -eq "AsTask" } |
  ForEach-Object { $_.ToString() }

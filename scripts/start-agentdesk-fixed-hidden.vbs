Option Explicit

Dim shell, command
Set shell = CreateObject("WScript.Shell")

shell.CurrentDirectory = "G:\devspace-copt-lab\devspace"
command = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""G:\devspace-copt-lab\devspace\scripts\run-agentdesk-fixed.ps1"""

' 0 = hidden window, False = do not wait. The PowerShell supervisor stays alive in the background.
shell.Run command, 0, False

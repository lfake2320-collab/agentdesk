Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
projectRoot = fso.GetParentFolderName(scriptDir)
ps1 = fso.BuildPath(scriptDir, "run-agentdesk-fixed.ps1")
shell.CurrentDirectory = projectRoot
cmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File " & Chr(34) & ps1 & Chr(34) & " -ProjectRoot " & Chr(34) & projectRoot & Chr(34)
shell.Run cmd, 0, False

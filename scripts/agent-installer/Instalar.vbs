Option Explicit
Dim shell, files, folder, command, result
Set shell = CreateObject("WScript.Shell")
Set files = CreateObject("Scripting.FileSystemObject")
folder = files.GetParentFolderName(WScript.ScriptFullName)
command = """" & shell.ExpandEnvironmentStrings("%SystemRoot%") & "\System32\WindowsPowerShell\v1.0\powershell.exe"" -NoProfile -STA -WindowStyle Hidden -ExecutionPolicy Bypass -File """ & folder & "\install.ps1"""
result = shell.Run(command, 0, True)
WScript.Quit result

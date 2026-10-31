Option Explicit
Dim shell, files, folder, command, result
Set shell = CreateObject("WScript.Shell")
Set files = CreateObject("Scripting.FileSystemObject")
folder = files.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = folder
command = """" & folder & "\runtime\node.exe"" """ & folder & "\scripts\thermal-agent\supervisor.js"""
result = shell.Run(command, 0, True)
WScript.Quit result

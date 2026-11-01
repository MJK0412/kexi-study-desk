Option Explicit

Dim fso, shell, root, desktop, linkPath, shortcut, iconPath, scriptPath
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

root = fso.GetParentFolderName(WScript.ScriptFullName)
scriptPath = root & "\start-kexi.vbs"
iconPath = root & "\kexi.ico"

If Not fso.FileExists(scriptPath) Then
  MsgBox "Missing start-kexi.vbs. Keep this file in the same folder as runtime, server and dist.", 16, "Kexi"
  WScript.Quit 1
End If

desktop = shell.SpecialFolders("Desktop")
linkPath = desktop & "\" & ChrW(35838) & ChrW(38553) & ".lnk"
Set shortcut = shell.CreateShortcut(linkPath)
shortcut.TargetPath = shell.ExpandEnvironmentStrings("%WINDIR%") & "\System32\wscript.exe"
shortcut.Arguments = Chr(34) & scriptPath & Chr(34)
shortcut.WorkingDirectory = root
shortcut.IconLocation = iconPath & ",0"
shortcut.Description = "Kexi - local course study desk"
shortcut.Save

MsgBox "Desktop shortcut created: " & linkPath, 64, "Kexi"

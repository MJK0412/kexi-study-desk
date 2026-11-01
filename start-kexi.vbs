Option Explicit

Dim fso, shell, appShell, root, nodePath, pythonPath, scriptPath, logPath, launcherLogPath
Dim command, q, url, ready, i

Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

root = fso.GetParentFolderName(WScript.ScriptFullName)
q = Chr(34)
nodePath = root & "\runtime\node\node.exe"
pythonPath = root & "\runtime\python\python.exe"
scriptPath = root & "\server\index.mjs"
logPath = root & "\server\app.log"
launcherLogPath = root & "\server\launcher.log"
url = "http://127.0.0.1:5173"

Sub AppendLog(message)
  On Error Resume Next
  Dim stream
  Set stream = fso.OpenTextFile(launcherLogPath, 8, True)
  stream.WriteLine Now & "  " & message
  stream.Close
End Sub

Function ServerReady()
  On Error Resume Next
  Dim client, ok
  ok = False
  Set client = CreateObject("WinHttp.WinHttpRequest.5.1")
  client.SetTimeouts 1200, 1200, 1200, 1200
  client.Open "GET", url & "/api/health", False
  client.Send
  If Err.Number = 0 Then
    If client.Status = 200 Then ok = True
  End If
  Err.Clear
  On Error GoTo 0
  ServerReady = ok
End Function

AppendLog "launcher start"

If Not fso.FileExists(nodePath) Then
  AppendLog "missing node: " & nodePath
  MsgBox "Missing bundled Node runtime:" & vbCrLf & nodePath, 16, "Kexi launcher error"
  WScript.Quit 1
End If

If Not fso.FileExists(scriptPath) Then
  AppendLog "missing server script: " & scriptPath
  MsgBox "Missing Kexi server file:" & vbCrLf & scriptPath, 16, "Kexi launcher error"
  WScript.Quit 1
End If

shell.CurrentDirectory = root
If fso.FileExists(pythonPath) Then
  shell.Environment("PROCESS").Item("KEXI_PYTHON") = pythonPath
End If

ready = ServerReady()

If Not ready Then
  AppendLog "server not ready; starting"
  command = "cmd /c " & q & q & nodePath & q & " " & q & scriptPath & q & " --no-open >> " & q & logPath & q & " 2>&1" & q
  shell.Run command, 0, False

  For i = 1 To 40
    WScript.Sleep 500
    If ServerReady() Then
      ready = True
      Exit For
    End If
  Next
Else
  AppendLog "server already ready"
End If

If ready Then
  AppendLog "opening " & url
  On Error Resume Next
  Set appShell = CreateObject("Shell.Application")
  appShell.ShellExecute url, "", "", "open", 1
  If Err.Number <> 0 Then
    Err.Clear
    shell.Run url, 1, False
  End If
  On Error GoTo 0
  AppendLog "browser requested"
Else
  AppendLog "server failed to become ready"
  MsgBox "Kexi server failed to start." & vbCrLf & vbCrLf & "See log:" & vbCrLf & logPath, 16, "Kexi launcher error"
  WScript.Quit 1
End If

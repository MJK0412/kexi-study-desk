Option Explicit

Dim fso, shell, appShell, root, nodePath, scriptPath, logPath, launcherLogPath
Dim command, q, url, ready, attempt, http, i

Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

root = fso.GetParentFolderName(WScript.ScriptFullName)
q = Chr(34)
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

If Not fso.FileExists(scriptPath) Then
  AppendLog "missing server script: " & scriptPath
  MsgBox "找不到课隙程序文件：" & scriptPath, 16, "课隙启动失败"
  WScript.Quit 1
End If

nodePath = ""
If fso.FileExists("D:\ai\node.exe") Then
  nodePath = "D:\ai\node.exe"
ElseIf fso.FileExists("C:\Program Files\nodejs\node.exe") Then
  nodePath = "C:\Program Files\nodejs\node.exe"
Else
  nodePath = "node"
End If

ready = ServerReady()

If Not ready Then
  AppendLog "server not ready; starting"
  shell.CurrentDirectory = root
  command = "cmd /c " & q & q & nodePath & q & " " & q & scriptPath & q & " --dev --no-open >> " & q & logPath & q & " 2>&1" & q
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
  MsgBox "课隙服务启动失败。" & vbCrLf & vbCrLf & "请查看日志：" & logPath, 16, "课隙启动失败"
  WScript.Quit 1
End If

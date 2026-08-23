Option Explicit

Dim shell, fileSystem, root, launcher, exitCode
Set shell = CreateObject("WScript.Shell")
Set fileSystem = CreateObject("Scripting.FileSystemObject")

root = fileSystem.GetParentFolderName(WScript.ScriptFullName)
launcher = fileSystem.BuildPath(root, "scripts\launch-pet.mjs")
shell.CurrentDirectory = root

On Error Resume Next
exitCode = shell.Run("node """ & launcher & """", 0, True)
If Err.Number <> 0 Or exitCode <> 0 Then
  MsgBox "LocalOps Guardian could not start." & vbCrLf & vbCrLf & _
    "Check Node.js 22-24, run npm run build once, and make sure Microsoft Edge is installed.", _
    vbExclamation, "LocalOps Guardian"
End If

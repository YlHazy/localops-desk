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
    "Check Node.js 22-24, the built app files, and Microsoft Edge. If they are ready, retry: the Edge app window may not have finished loading.", _
    vbExclamation, "LocalOps Guardian"
End If

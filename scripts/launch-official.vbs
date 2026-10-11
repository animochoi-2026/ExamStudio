Option Explicit
Dim shell, fso, root, exe, dataRoot
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(WScript.ScriptFullName)
If LCase(fso.GetFileName(root)) = "scripts" Then root = fso.GetParentFolderName(root)
dataRoot = fso.BuildPath(root, "data\r2-current")
exe = fso.BuildPath(root, "runtime\current\" & ChrW(&HBB38) & ChrW(&HC81C) & ChrW(&HACF5) & ChrW(&HBC29) & ".exe")
If Not fso.FileExists(fso.BuildPath(dataRoot, "index.json")) Or Not fso.FileExists(fso.BuildPath(dataRoot, "exam-queue.json")) Or Not fso.FileExists(exe) Then
  MsgBox "The preserved R2 app or data profile is missing. No empty profile was created.", 16, "ExamStudio R2"
  WScript.Quit 1
End If
shell.Environment("Process")("EXAM_DATA_DIR") = dataRoot
shell.Environment("Process")("EXAM_OUTPUT_DIR") = fso.BuildPath(root, ChrW(&HACB0) & ChrW(&HACFC) & ChrW(&HBB3C))
shell.Environment("Process").Remove "ELECTRON_RUN_AS_NODE"
shell.CurrentDirectory = root
shell.Run Chr(34) & exe & Chr(34), 1, False

$ws = New-Object -ComObject WScript.Shell
$shortcut = $ws.CreateShortcut([Environment]::GetFolderPath('Desktop') + '\League Coach.lnk')
$shortcut.TargetPath = 'C:\Users\lucas\league\league-coach.bat'
$shortcut.WorkingDirectory = 'C:\Users\lucas\league'
$shortcut.IconLocation = 'C:\Windows\System32\imageres.dll,3'
$shortcut.Description = 'League Coach Desktop Application'
$shortcut.Save()

Write-Host "Desktop shortcut created successfully!"
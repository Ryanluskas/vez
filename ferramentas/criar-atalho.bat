@echo off
setlocal
cd /d "%~dp0\.."

echo Gerando o icone...
node ferramentas\gerar-icone.js

echo Criando o atalho na Area de Trabalho...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$raiz = (Get-Location).Path;" ^
  "$w = New-Object -ComObject WScript.Shell;" ^
  "$a = $w.CreateShortcut([IO.Path]::Combine($w.SpecialFolders('Desktop'),'Vez.lnk'));" ^
  "$a.TargetPath = [IO.Path]::Combine($raiz,'Vez.bat');" ^
  "$a.WorkingDirectory = $raiz;" ^
  "$a.IconLocation = [IO.Path]::Combine($raiz,'ferramentas','Vez.ico');" ^
  "$a.Description = 'Liga o painel e o motor do Vez';" ^
  "$a.Save();" ^
  "Write-Host ('Atalho criado: ' + [IO.Path]::Combine($w.SpecialFolders('Desktop'),'Vez.lnk'))"

echo.
pause

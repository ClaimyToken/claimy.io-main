@echo off
cd /d "%~dp0\.."
echo Syncing .env to src\environments\env.overrides.ts ...
node scripts\sync-env.cjs
if errorlevel 1 exit /b 1
echo Starting Angular dev server...
node node_modules\@angular\cli\bin\ng.js serve

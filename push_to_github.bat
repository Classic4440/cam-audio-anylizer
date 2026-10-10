@echo off
cd /d "%~dp0"

echo Checking for changes...
git status

echo Adding all changes...
git add .

:: Create timestamp for commit message
for /f "tokens=1-3 delims=/ " %%a in ("%date%") do (
    set day=%%a
    set month=%%b
    set year=%%c
)
set timestamp=%year%-%month%-%day%_%time:~0,2%-%time:~3,2%

echo Committing...
git commit -m "Auto commit on %timestamp%"

echo Pushing to GitHub...
git push

echo Done!
pause
@echo off
rem Daily auto-update wrapper for Windows Task Scheduler (silent, logged)
cd /d %~dp0
echo ===== %date% %time% ===== >> update-log.txt
call update.bat auto >> update-log.txt 2>&1

@echo off
setlocal
title Calendar Server
cd /d "%~dp0"

where python >nul 2>&1
if errorlevel 1 (
    echo Python was not found on PATH.
    pause
    exit /b 1
)

for /f "delims=" %%I in ('powershell -NoProfile -Command "$addresses = [System.Net.Dns]::GetHostAddresses([System.Net.Dns]::GetHostName()); foreach ($a in $addresses) { if ($a.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetwork -and $a.GetAddressBytes()[0] -ne 127 -and $a.GetAddressBytes()[0] -ne 169) { Write-Output $a.IPAddressToString; break } }"') do set "LAN_IP=%%I"

echo Calendar server is running.
echo Calendar link: http://localhost:8000/index.html
if defined LAN_IP echo Shared calendar link: http://%LAN_IP%:8000/index.html
echo.
echo Keep this window open. Closing it stops the server.
echo Press Ctrl+C to stop it gracefully.
echo.

python -m http.server 8000 --bind 0.0.0.0

endlocal

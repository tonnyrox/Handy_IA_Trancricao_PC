@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo ============================================================
echo   PAINEL DE TESTE - MICROFONE + TRANSCRICAO (NVIDIA)
echo ============================================================
echo   Abrindo janela... clique em PLAY, fale, clique em PARAR.
echo ============================================================
echo.
where python >nul 2>nul && (python "teste_mic.py") || (echo Python nao encontrado no PATH. & pause & exit /b 1)

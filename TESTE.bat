@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo ============================================================
echo   TESTE RAPIDO DE TRANSCRICAO (sem buildar)
echo ============================================================
echo   Fale em portugues no app (Caps Lock), depois execute este .bat
echo   Opcoes: TESTE.bat listar  |  TESTE.bat modelo ID_DO_MODELO
echo ============================================================
echo.
where python >nul 2>nul && (python "teste_rapido.py" %*) || (echo Python nao encontrado no PATH. Instale o Python ou use o venv do projeto. & pause & exit /b 1)
echo.
pause

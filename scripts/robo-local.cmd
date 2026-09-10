@echo off
setlocal EnableDelayedExpansion
rem  UTF-8 no console: sem isto o log sai com "cadǦncia" e "nǜo", e log ilegível é log que
rem  ninguém lê quando o robô falha às 8h da manhã.
chcp 65001 >nul 2>&1
rem ════════════════════════════════════════════════════════════════════════════════════
rem  O ROBÔ RODANDO NESTA MÁQUINA, SEM GITHUB ACTIONS (10/09/26)
rem ════════════════════════════════════════════════════════════════════════════════════
rem  Por que isto existe: em 10/09 o GitHub bloqueou as Actions por cobrança, e a franquia
rem  de 2.000 min/mês do repositório privado já estava consumida (medido: ~376 min/dia,
rem  114 rodadas em 23h). O robô é um script Node que lê o HubSpot e grava em
rem  cockpit_snapshot no Supabase — ele não precisa do GitHub para nada. Rodando aqui, o
rem  cockpit continua fresco e não entra minuto nenhum na conta.
rem
rem  O QUE ELE PRECISA: três variáveis, num arquivo .env.local ao lado do repositório
rem  (esse arquivo está no .gitignore e NUNCA deve ser commitado):
rem
rem      HUBSPOT_TOKEN=...
rem      SUPABASE_URL=https://xitmahwxncpdzopmdook.supabase.co
rem      SUPABASE_SERVICE_KEY=...
rem
rem  Onde achar cada uma:
rem      SUPABASE_URL           já está acima (é pública, aparece no bundle da tela)
rem      SUPABASE_SERVICE_KEY   Supabase > Project Settings > API > service_role
rem      HUBSPOT_TOKEN          Vercel > Settings > Environment Variables (revelar e
rem                             copiar) ou HubSpot > Integrações > Apps privados
rem
rem  COMO RODAR NA MÃO:      scripts\robo-local.cmd
rem  COMO AGENDAR (30 min):  o comando schtasks está no fim deste arquivo
rem ════════════════════════════════════════════════════════════════════════════════════

set "RAIZ=%~dp0.."
set "ENVFILE=%RAIZ%\.env.local"
set "NODEEXE=C:\Users\Takeat\AppData\Local\OpenAI\Codex\runtimes\cua_node\c2900163265bdaec\bin\node.exe"
set "LOG=%RAIZ%\.robo-local.log"

if not exist "%ENVFILE%" (
  echo [robo-local] Nao achei %ENVFILE%
  echo [robo-local] Crie o arquivo com HUBSPOT_TOKEN, SUPABASE_URL e SUPABASE_SERVICE_KEY.
  echo [robo-local] Ele esta no .gitignore: nunca vai para o repositorio.
  exit /b 1
)
if not exist "%NODEEXE%" (
  echo [robo-local] Nao achei o node em %NODEEXE%
  echo [robo-local] Ajuste a variavel NODEEXE no topo deste arquivo.
  exit /b 1
)

rem  Le o .env.local linha por linha. Ignora linha vazia e comentario, e NAO ecoa valor
rem  nenhum na tela — segredo em log de terminal e segredo vazado.
for /f "usebackq tokens=1,* delims==" %%A in ("%ENVFILE%") do (
  set "CHAVE=%%A"
  if not "!CHAVE:~0,1!"=="#" if not "%%B"=="" set "%%A=%%B"
)

if "%HUBSPOT_TOKEN%"=="" ( echo [robo-local] HUBSPOT_TOKEN nao definido no .env.local & exit /b 1 )
if "%SUPABASE_URL%"=="" ( echo [robo-local] SUPABASE_URL nao definido no .env.local & exit /b 1 )
if "%SUPABASE_SERVICE_KEY%"=="" ( echo [robo-local] SUPABASE_SERVICE_KEY nao definido no .env.local & exit /b 1 )

rem  GITHUB_EVENT_NAME: o robô olha essa variável para decidir se a rodada é manual. Aqui
rem  toda rodada é "workflow_dispatch" — é o mesmo caminho que o webhook usava.
set "GITHUB_EVENT_NAME=workflow_dispatch"

echo [robo-local] %DATE% %TIME% - iniciando >> "%LOG%"
pushd "%RAIZ%"
"%NODEEXE%" scripts\fetch-hubspot.js >> "%LOG%" 2>&1
set "SAIDA=%ERRORLEVEL%"
popd
echo [robo-local] %DATE% %TIME% - terminou com codigo %SAIDA% >> "%LOG%"

if not "%SAIDA%"=="0" (
  echo [robo-local] O robo falhou. As ultimas linhas do log:
  powershell -NoProfile -Command "Get-Content '%LOG%' -Tail 12"
) else (
  echo [robo-local] Rodada concluida. Log em %LOG%
)
exit /b %SAIDA%

rem ════════════════════════════════════════════════════════════════════════════════════
rem  AGENDAR DE 30 EM 30 MINUTOS, das 8h às 20h, de segunda a sexta
rem  (o mesmo ritmo que o cooldown de 30 min do webhook passou a permitir):
rem
rem    schtasks /Create /TN "Cockpit - robo local" /SC MINUTE /MO 30 ^
rem      /ST 08:00 /ET 20:00 /K /D MON,TUE,WED,THU,FRI ^
rem      /TR "C:\Users\Takeat\Documents\GitHub\cockpit-unificado\scripts\robo-local.cmd"
rem
rem  Para conferir:   schtasks /Query /TN "Cockpit - robo local"
rem  Para remover:    schtasks /Delete /TN "Cockpit - robo local" /F
rem ════════════════════════════════════════════════════════════════════════════════════

# Cockpit Unificado — auto-atualização diária

Este pacote faz o Cockpit Unificado (HubSpot + Expogo) atualizar sozinho, todo dia, sem
precisar criar link novo no Netlify. Configuração é única — depois disso, zero cliques.

## O que atualiza sozinho vs. o que fica manual

| Camada | Arquivo | Atualiza |
|---|---|---|
| KPIs, funil por etapa, volume por executivo, leads críticos | `data/hubspot.json` | **Sozinho, todo dia às 9h** (GitHub Actions busca no HubSpot) |
| Visitas GPS, motivo de perda, KPIs de campo | `data/expogo.json` | **Manual** — substitua este arquivo quando tiver um novo export RPA |
| Gargalo, boas práticas, compromissos do PDI, tag (crít/atenção/ok) | `data/narrativas.json` | **Manual** — só muda quando você pedir pra Claude atualizar a análise |

## Passo a passo (fazer uma vez só)

### 1. Criar um token do HubSpot
No HubSpot: **Configurações → Integrações → Private Apps → Criar app privado**
- Nome: `Cockpit Unificado`
- Escopos necessários: `crm.objects.deals.read`
- Copie o token gerado (começa com `pat-...`) — vai usar no passo 3.

### 2. Criar o repositório no GitHub
1. Crie um repositório novo (pode ser privado) — ex: `cockpit-unificado`
2. Suba todos os arquivos desta pasta pra ele (mantendo a estrutura de pastas)

### 3. Configurar o secret do HubSpot no GitHub
No repositório: **Settings → Secrets and variables → Actions → New repository secret**
- Nome: `HUBSPOT_TOKEN`
- Valor: o token `pat-...` do passo 1

### 4. Conectar o Netlify a esse repositório
Como seu site atual foi feito por upload manual, ele não está ligado a um repo. No Netlify:
1. Abra o site existente → **Site configuration → Build & deploy → Link repository**
   (ou, se essa opção não aparecer para sites de upload manual, crie um **novo site** com
   "Import from Git" apontando pro mesmo repositório — e depois eu te ajudo a apontar
   seu domínio/link atual pra esse novo site, se você quiser manter a mesma URL)
2. Configurações de build: já vêm do `netlify.toml` (publish = `public/`, sem comando de build)

### 5. Testar
No GitHub: **Actions → Atualizar cockpit diariamente → Run workflow** (botão manual, não
precisa esperar o cron). Se rodar verde, o Netlify vai detectar o push e redeployar sozinho
em ~1 minuto.

Depois disso: o workflow roda sozinho todo dia às 9h (horário de Brasília). Se um dia não
houver mudança nos números, ele simplesmente não commita nada — sem barulho, sem deploy
desnecessário.

## Quando quiser atualizar a análise ou o Expogo

- **Expogo:** me manda o novo export (ou me diga os números novos) e eu regenero
  `data/expogo.json` — você sobe o arquivo atualizado no repo (ou eu te devolvo pronto
  pra você colar).
- **Análise (gargalo/boas práticas/PDI):** é só pedir "atualiza a análise do cockpit" — eu
  releio os dados mais recentes do HubSpot + Expogo e te devolvo o `data/narrativas.json`
  novo pra você subir.

## Rodando localmente (opcional, pra testar antes de subir)

```bash
export HUBSPOT_TOKEN=pat-xxxxxxxx
npm run refresh   # busca HubSpot + gera public/index.html
```

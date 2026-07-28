# Revista Sinduscon — página editorial automatizada

Sistema "irmão" do [blog automatizado](../README.md), no mesmo repositório. Mesma filosofia (pesquisa → escreve → aguarda aprovação humana → notifica), mas com cadência **mensal**, saída em **ClickUp** (+ Google Doc opcional; não WordPress), e sem publicação automática — a diagramação no InDesign e o envio pra gráfica são 100% manuais.

## Como funciona

1. Lê o histórico de edições em [`temas-revista-usados.json`](temas-revista-usados.json) e evita repetir tema/categoria das últimas ~6 edições.
2. Pesquisa temas com a tool `web_search` da Anthropic, priorizando assuntos **duradouros** (a revista circula 1-2 meses depois de escrita) e não necessariamente ligados a seguros.
3. Escreve a página editorial completa (estrutura de 10 partes) usando o [prompt do Diretor Editorial](data/prompt-diretor-editorial-sinduscon.md) + o manual de marca (reaproveitado de [`../data/referencia-tom-de-voz-marca-south.md`](../data/referencia-tom-de-voz-marca-south.md)).
4. **(Opcional)** Se `GOOGLE_SERVICE_ACCOUNT_JSON` e `GOOGLE_DRIVE_FOLDER_ID_REVISTA` estiverem configurados, cria também um Google Doc com o conteúdo completo. Sem essas variáveis, esse passo é simplesmente pulado (não bloqueia o resto do pipeline).
5. Cria uma task no ClickUp com tema, o **texto completo** da página editorial (+ link do Google Doc, se existir), prazo de envio pra gráfica, e status inicial **"Aprovar"**. Como o texto completo já vai na task, o Google Doc é só um "extra" — não é necessário configurá-lo.
6. Atualiza `temas-revista-usados.json` e commita no repositório.
7. Notifica no Discord (canal dedicado à revista) que a edição do mês está pronta para revisão — e também qualquer erro de execução.

Você revisa o texto (no Google Doc ou na task do ClickUp) e muda o status manualmente quando aprovar. Daí em diante, diagramação e gráfica são fora do sistema.

## Reaproveitado do sistema do blog

Para não duplicar código de apoio, este módulo importa diretamente de `../src/`:
- `createAnthropicClient` (`../src/anthropic.js`)
- `createGoogleDocCopy` / autenticação da Service Account (`../src/googleDocs.js`)
- `send` — envio de embeds ao Discord (`../src/discord.js`)

E reaproveita o arquivo `../data/referencia-tom-de-voz-marca-south.md` sem duplicar.

## Passos manuais — fazer ANTES de ativar o agendamento

### 1. ClickUp
1. Crie (ou escolha) uma **Lista** dedicada, ex: "Revista Sinduscon".
2. Nas configurações de **Status** dessa Lista (ou do Space), crie um status customizado **"Aprovar"** (o script cria a task diretamente com esse status — se ele não existir, a criação da task falha). Opcionalmente crie também "Aprovado" e "Enviado pra gráfica" para seu controle visual.
3. Pegue o **ID da Lista**: abra a lista no navegador e copie o número da URL (`.../li/<ID_DA_LISTA>`).
4. Gere um **API Token pessoal**: avatar → *Settings* → *Apps* → *API Token* → *Generate*.

### 2. Google Drive (opcional — pode pular)
Só necessário se você quiser *também* uma cópia em Google Doc além da task do ClickUp (que já recebe o texto completo). Envolve criar uma Service Account no Google Cloud Console, o que não é trivial para quem não mexe com programação — fique à vontade para pular esta etapa inteira e não configurar `GOOGLE_SERVICE_ACCOUNT_JSON` nem `GOOGLE_DRIVE_FOLDER_ID_REVISTA`. Sem elas, o pipeline funciona normalmente e manda tudo só pro ClickUp.

### 3. Discord
Crie um **novo canal** dedicado só a esta automação (ex: `#revista-alertas`, separado do canal do blog) → Configurações do Canal → Integrações → Webhooks → Novo Webhook → copie a URL.

### 4. Configurar os Secrets no GitHub
Em **Settings → Secrets and variables → Actions** deste repositório, crie (além dos já usados pelo blog, que não precisam ser recriados):

| Secret | Obrigatório | Para quê |
|---|---|---|
| `ANTHROPIC_API_KEY` | sim | Chamadas à API da Anthropic (pesquisa + redação) |
| `CLICKUP_API_TOKEN` | sim | Autenticação com a API do ClickUp |
| `CLICKUP_LIST_ID` | sim | Lista do ClickUp onde as tasks mensais serão criadas |
| `DISCORD_WEBHOOK_URL_REVISTA` | sim | Webhook do canal de alertas/bugs da revista |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | não | Só se quiser também a cópia em Google Doc |
| `GOOGLE_DRIVE_FOLDER_ID_REVISTA` | não | Pasta do Drive dedicada à revista (só junto com o secret acima) |

> Os secrets novos usam o sufixo `_REVISTA` para deixar claro o que pertence a cada sistema, já que secrets do GitHub Actions são visíveis para todos os workflows do repositório.

## Testar antes de agendar

Dispare manualmente pela aba **Actions** do GitHub → workflow **"Gerar edição da revista Sinduscon"** → **Run workflow**. Revise o Google Doc e a task no ClickUp antes de deixar o cron mensal ativo.

### Testar localmente (opcional)

```bash
cp ../.env.example ../.env   # preencha as chaves (na raiz do repositório)
npm install
node --env-file=../.env revista/src/run.js
```

## Frequência

O workflow roda 1x por mês, todo **dia 25**. Ajuste o `cron` em [`../.github/workflows/revista.yml`](../.github/workflows/revista.yml) se precisar de mais ou menos antecedência antes do envio pra gráfica.

## Controle de repetição de temas e categorias

`temas-revista-usados.json` guarda tema, categoria/eixo e data de cada edição. Antes de escolher o tema do mês, o agente lê as últimas ~6 edições e recebe instrução explícita para não repetir tema nem categoria recente — é um controle orientado por prompt (o agente decide), não uma validação rígida no código.

Lista de eixos temáticos sugerida (definida em [`src/temas.js`](src/temas.js), ajustável): Segurança, Contratos e Riscos Jurídicos, Sustentabilidade, Produtividade e Custos, Inovação, Continuidade Operacional, Legislação.

## Prazo pra gráfica

O prazo (`due_date`) de cada task no ClickUp é calculado como **10 dias após a execução** (rodando dia 25, cai por volta do dia 4-5 do mês seguinte — a "1ª semana", conforme a linha do tempo do brief). Ajuste em `prazoGrafica()` em [`src/run.js`](src/run.js) se quiser outra folga.

## Estrutura do projeto

```
revista/
  data/
    prompt-diretor-editorial-sinduscon.md   # prompt do redator (10 partes)
  temas-revista-usados.json                 # histórico de temas/categorias
  src/
    config.js       # carrega e valida variáveis de ambiente
    temas.js         # histórico + categorias fixas
    anthropic.js       # pesquisa (web_search) + escolha do tema + redação (10 partes)
    clickup.js           # criação da task
    discord.js             # notificações de sucesso/erro
    run.js                  # orquestrador principal
```

O manual de marca (`referencia-tom-de-voz-marca-south.md`) fica em [`../data/`](../data/), reaproveitado do sistema do blog.

# Blog Automatizado — Southcorp

Pipeline que roda semanalmente no GitHub Actions e escreve os textos da semana como rascunhos **pendentes de revisão** no WordPress — nunca publica sozinho.

A semana tem **4 vagas**: 2 de **Seguro Garantia** (posicionamento) e 2 de **tema diverso**. Cada vaga rende **3 pautas diferentes entre si** — assuntos distintos, não versões do mesmo texto —, para escolha editorial. São **12 rascunhos por semana**, dos quais se publica 4.

> Este repositório também hospeda o sistema "irmão" da [Revista Sinduscon](revista/README.md) (`/revista`), com cadência mensal e saída em Google Doc + ClickUp. Reaproveita a chamada à Anthropic API, a autenticação do Google Docs e o envio ao Discord já usados aqui.

## Como funciona

1. Monta as 4 vagas da semana a partir de `semana.vagas` em [`data/pautas-cronograma.json`](data/pautas-cronograma.json), preenchendo cada uma com 3 pautas do produto daquela vaga. Usa primeiro a fila pré-escrita (códigos S012–S046, 20 pautas); quando ela acaba **para aquele produto**, pesquisa e propõe pautas novas, recebendo a lista do que já foi coberto para não repetir assunto. As vagas de tema diverso rodam entre Engenharia, RC e Institucional.
2. Para cada pauta: pesquisa dados atuais com a tool `web_search` da Anthropic, depois redige o artigo completo usando o [prompt do redator SEO](data/prompt-agente-redator-seo.md) + o [manual de marca](data/referencia-tom-de-voz-marca-south.md) como contexto.
3. Busca uma imagem de capa na Unsplash pela palavra-chave do post.
4. Sobe a imagem e cria o post no WordPress via REST API, status `pending`, com a imagem definida como destaque.
5. Opcionalmente cria uma cópia em Google Doc.
6. Notifica no Discord com o título do post e o link direto de edição no WP admin.
7. Você revisa no WordPress e aprova/agenda manualmente.

Controle de fila: [`status.json`](status.json), atualizado e commitado automaticamente a cada execução.

## Passos manuais — fazer ANTES de ativar o agendamento

### 1. Usuário do robô no WordPress
1. **Usuários → Adicionar novo** → papel **Contributor**.
2. No perfil desse usuário: **Usuários → Perfil → Application Passwords** (parte de baixo da tela) → gerar uma senha de aplicativo. Guarde o valor gerado (só aparece uma vez).
3. Instale um plugin leve de gestão de papéis, ex. **"User Role Editor"**, e libere apenas a capability **`upload_files`** para o papel Contributor — sem tocar em `publish_posts` nem `manage_categories`. Isso permite que o robô suba a imagem de capa, mas nunca publique sozinho.

### 2. Categorias no WordPress
O script escolhe a categoria pelo **produto** da pauta, usando o slug definido em `categoriaPorProduto` no [`data/pautas-cronograma.json`](data/pautas-cronograma.json). Os slugs abaixo **já existem** no site da Southcorp — se algum for renomeado lá, atualize aqui. Se o slug não existir, o post é criado sem categoria (não trava o pipeline):

| Produto da pauta | Slug no WordPress |
|---|---|
| Garantia | `seguro-garantia` |
| Engenharia | `seguro-risco-engenharia` |
| RC | `seguro-responsabilidade-civil` |
| Institucional | `geral` |

A `grade` de frentes por dia da semana continua no arquivo, mas hoje define só o **ângulo editorial** sugerido às pautas geradas (notícia, pessoas, governança, operação, bastidores), não a categoria.

### 3. Unsplash
Crie uma conta de desenvolvedor em [unsplash.com/developers](https://unsplash.com/developers), registre uma aplicação e copie a **Access Key** (gratuita).

### 4. Discord
No canal desejado → **Configurações do Canal → Integrações → Webhooks → Novo Webhook** → copie a URL.

### 5. Anthropic
Gere uma API key em [console.anthropic.com](https://console.anthropic.com) (cobrada por uso, separado da assinatura do Claude.ai).

### 6. (Opcional) Google Doc
Crie uma Service Account no Google Cloud Console, ative a Drive API, gere a chave JSON e compartilhe a pasta do Drive de destino com o e-mail da service account (`client_email` do JSON).

### 7. Configurar os Secrets no GitHub
Em **Settings → Secrets and variables → Actions** deste repositório, crie:

| Secret | Obrigatório | Para quê |
|---|---|---|
| `ANTHROPIC_API_KEY` | sim | Chamadas à API da Anthropic |
| `WP_SITE_URL` | sim | URL do site WordPress (ex: `https://seusite.com.br`) |
| `WP_USERNAME` | sim | Usuário Contributor criado no passo 1 |
| `WP_APPLICATION_PASSWORD` | sim | Application Password gerada no passo 1 |
| `DISCORD_WEBHOOK_URL` | sim | URL do webhook do passo 4 |
| `UNSPLASH_ACCESS_KEY` | sim | Access Key do passo 3 |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | opcional | Conteúdo completo do JSON da service account |
| `GOOGLE_DRIVE_FOLDER_ID` | opcional | ID da pasta do Drive para as cópias |

Nenhuma dessas chaves deve ir para o código-fonte.

## Testar antes de agendar

Com os secrets configurados, dispare manualmente pela aba **Actions** do GitHub → workflow **"Gerar posts do blog"** → **Run workflow**. Revise o resultado no WordPress e no canal do Discord antes de deixar o cron semanal ativo.

### Testar localmente (opcional)

```bash
cp .env.example .env   # preencha as chaves
npm install
node --env-file=.env src/run.js
```

## Frequência

O workflow roda 1x por semana (segunda 00:00 UTC = domingo 21:00 em Brasília) e escreve os 12 rascunhos da semana de uma vez, para revisão em bloco. Para mudar a frequência, edite o `cron` em [`.github/workflows/generate-posts.yml`](.github/workflows/generate-posts.yml).

Para mudar o volume ou a composição da semana, edite `semana` em [`data/pautas-cronograma.json`](data/pautas-cronograma.json): `opcoesPorVaga` controla quantos textos por vaga, e `vagas` controla quantas vagas e de qual produto (`produto: null` = tema diverso).

## Créditos de imagem

O nome do fotógrafo do Unsplash é incluído automaticamente como comentário HTML no corpo do post (boa prática, não exigida pela licença) e enviado também na notificação do Discord.

## Estrutura do projeto

```
data/                           # arquivos de referência (cronograma, prompt do redator, manual de marca)
src/
  config.js                     # carrega e valida variáveis de ambiente
  queue.js                      # vagas da semana, fila (status.json) e categoria por produto
  anthropic.js                  # pesquisa (web_search) e redação (saída estruturada via tool use)
  unsplash.js                   # busca e download da imagem de capa
  wordpress.js                  # upload de mídia e criação do post via REST API
  googleDocs.js                 # cópia opcional em Google Doc
  discord.js                    # notificações de sucesso/erro
  run.js                        # orquestrador principal
status.json                     # controle de quais pautas já foram produzidas
.github/workflows/generate-posts.yml
```

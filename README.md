# Blog Automatizado — Southcorp

Pipeline que roda semanalmente no GitHub Actions e gera os 5 posts da semana (segunda a sexta) como rascunhos **pendentes de revisão** no WordPress — nunca publica sozinho.

## Como funciona

1. Segue a fila de pautas pré-definida em [`data/pautas-cronograma.json`](data/pautas-cronograma.json) (códigos S012–S046). Quando a fila acaba, passa a pesquisar e propor pautas novas seguindo a mesma lógica (frente por dia da semana + proporção de produto 40% Garantia / 30% Engenharia / 30% RC).
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
O script mapeia a "frente" do dia da semana para uma categoria pelo **slug**. Crie (ou renomeie categorias existentes) com estes slugs antes da primeira execução — se o slug não existir, o post é criado sem categoria (não trava o pipeline):

| Dia | Frente | Slug esperado |
|---|---|---|
| Segunda | Newsjacking & Visão de Futuro | `newsjacking` |
| Terça | Proteção de Pessoas & Cultura (Southlife) | `southlife` |
| Quarta | Linhas Financeiras & Riscos Invisíveis | `governanca` |
| Quinta | Riscos Patrimoniais & Operacionais | `engenharia` |
| Sexta | Bastidores, Cultura do Sul & Prova Social | `bastidores` |

Para mudar o mapeamento, edite `categoriaSlug` em [`data/pautas-cronograma.json`](data/pautas-cronograma.json) (chave `grade`).

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

O workflow roda 1x por semana (segunda 00:00 UTC = domingo 21:00 em Brasília) e gera os 5 posts da semana de uma vez, todos como rascunho pendente, para revisão em bloco. Para mudar a frequência, edite o `cron` em [`.github/workflows/generate-posts.yml`](.github/workflows/generate-posts.yml). Para gerar menos/mais posts por rodada, ajuste `POSTS_PER_RUN` (padrão 5) como variável de ambiente/secret.

## Créditos de imagem

O nome do fotógrafo do Unsplash é incluído automaticamente como comentário HTML no corpo do post (boa prática, não exigida pela licença) e enviado também na notificação do Discord.

## Estrutura do projeto

```
data/                           # arquivos de referência (cronograma, prompt do redator, manual de marca)
src/
  config.js                     # carrega e valida variáveis de ambiente
  queue.js                      # controle de fila (status.json) + seleção das próximas pautas
  anthropic.js                  # pesquisa (web_search) e redação (saída estruturada via tool use)
  unsplash.js                   # busca e download da imagem de capa
  wordpress.js                  # upload de mídia e criação do post via REST API
  googleDocs.js                 # cópia opcional em Google Doc
  discord.js                    # notificações de sucesso/erro
  run.js                        # orquestrador principal
status.json                     # controle de quais pautas já foram produzidas
.github/workflows/generate-posts.yml
```

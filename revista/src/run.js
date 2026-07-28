import { readFile } from "node:fs/promises";
import path from "node:path";

import { createAnthropicClient } from "../../src/anthropic.js";
import { createGoogleDocCopy } from "../../src/googleDocs.js";
import { loadConfig } from "./config.js";
import { loadHistorico, saveHistorico, registrarEdicao } from "./temas.js";
import { researchAndChooseTema, writeEditorial } from "./anthropic.js";
import { createClickUpTask } from "./clickup.js";
import { notifyEdicaoPronta, notifyErro } from "./discord.js";

const ASSINATURA = "Fazendo você se sentir mais seguro.";

function mesAnoAtual(date = new Date()) {
  return date.toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "America/Sao_Paulo" });
}

// Prazo pra gráfica: cerca de uma semana a partir do dia 25 (~1ª semana do
// mês seguinte), conforme a linha do tempo descrita no brief.
function prazoGrafica(date = new Date()) {
  const prazo = new Date(date);
  prazo.setUTCDate(prazo.getUTCDate() + 10);
  return prazo;
}

function stripHtml(html) {
  return html
    .replace(/<\/p>|<br\s*\/?>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .trim();
}

function buildDocHtml(editorial) {
  const frases = editorial.frasesDestacaveis.map((f) => `<li>${f}</li>`).join("");
  return `
<h1>${editorial.headline}</h1>
<p><em>${editorial.linhaApoio}</em></p>
<h2>1. Estratégia Editorial</h2><p>${editorial.estrategiaEditorial}</p>
<h2>2. Conceito Criativo</h2><p>${editorial.conceitoCriativo}</p>
<h2>3. Headline</h2><p>${editorial.headline}</p>
<h2>4. Linha de Apoio</h2><p>${editorial.linhaApoio}</p>
<h2>5. Corpo Editorial</h2>${editorial.corpoEditorialHtml}
<h2>6. Frases Destacáveis</h2><ul>${frases}</ul>
<h2>7. Sugestão de Direção de Arte</h2><p>${editorial.direcaoArte}</p>
<h2>8. Fechamento</h2><p>${editorial.fechamento}</p>
<h2>9. CTA</h2><p>${editorial.cta}</p>
<h2>10. Assinatura Institucional</h2><p><strong>${ASSINATURA}</strong></p>
`.trim();
}

function buildClickUpDescription({ tema, categoria, justificativa, editorial, googleDocUrl }) {
  return [
    ...(googleDocUrl ? [`Google Doc: ${googleDocUrl}`, ""] : []),
    `Tema: ${tema}`,
    `Categoria/eixo: ${categoria}`,
    `Justificativa: ${justificativa}`,
    "",
    `Headline: ${editorial.headline}`,
    `Linha de apoio: ${editorial.linhaApoio}`,
    "",
    "--- Corpo editorial ---",
    stripHtml(editorial.corpoEditorialHtml),
    "",
    "--- Frases destacáveis ---",
    ...editorial.frasesDestacaveis.map((f) => `- ${f}`),
    "",
    `Fechamento: ${editorial.fechamento}`,
    `CTA: ${editorial.cta}`,
    "",
    `Assinatura: ${ASSINATURA}`,
  ].join("\n");
}

async function main() {
  const now = new Date();
  const mesAno = mesAnoAtual(now);
  let config;

  try {
    config = loadConfig();
    const client = createAnthropicClient(config.anthropicApiKey);

    const editorPrompt = await readFile(path.resolve("revista/data/prompt-diretor-editorial-sinduscon.md"), "utf-8");
    const brandVoice = await readFile(path.resolve("data/referencia-tom-de-voz-marca-south.md"), "utf-8");

    const historico = await loadHistorico();

    console.log("Pesquisando e escolhendo o tema do mês...");
    const { tema, categoria, justificativa, research } = await researchAndChooseTema(client, { historico });
    console.log(`Tema escolhido: "${tema}" (categoria: ${categoria})`);

    console.log("Redigindo a página editorial...");
    const editorial = await writeEditorial(client, { tema, categoria, justificativa, research, editorPrompt, brandVoice });

    let googleDocUrl = null;
    try {
      console.log("Criando o Google Doc (opcional)...");
      googleDocUrl = await createGoogleDocCopy(config, {
        title: `Revista Sinduscon — ${mesAno} — ${editorial.headline}`,
        contentHtml: buildDocHtml(editorial),
      });
    } catch (docError) {
      console.warn(`Cópia em Google Doc falhou (não bloqueante, texto completo já vai na task do ClickUp): ${docError.message}`);
    }

    console.log("Criando a task no ClickUp...");
    const { url: clickupTaskUrl } = await createClickUpTask(config, {
      name: `Revista Sinduscon — ${mesAno} — ${editorial.headline}`,
      description: buildClickUpDescription({ tema, categoria, justificativa, editorial, googleDocUrl }),
      dueDateMs: prazoGrafica(now).getTime(),
    });

    registrarEdicao(historico, {
      tema,
      categoria,
      mesAno,
      data: now.toISOString(),
      googleDocUrl,
      clickupTaskUrl,
    });
    await saveHistorico(historico);

    await notifyEdicaoPronta(config.discordWebhookUrl, { mesAno, tema, categoria, googleDocUrl, clickupTaskUrl });

    console.log(`Edição de ${mesAno} criada com sucesso.\nGoogle Doc: ${googleDocUrl}\nClickUp: ${clickupTaskUrl}`);
  } catch (error) {
    console.error("Falha ao gerar a edição da revista:", error);
    if (config?.discordWebhookUrl) {
      await notifyErro(config.discordWebhookUrl, { mesAno, error });
    }
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("Falha fatal no pipeline da revista:", error);
  process.exitCode = 1;
});

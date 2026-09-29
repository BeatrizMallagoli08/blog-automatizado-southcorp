import { readFile } from "node:fs/promises";
import path from "node:path";

import { loadConfig } from "./config.js";
import {
  getNextPautas,
  saveStatus,
  marcarComoProduzida,
  categoriaDaPauta,
} from "./queue.js";
import { createAnthropicClient, researchTopic, writePost, generateNewPauta } from "./anthropic.js";
import { fetchCoverImage } from "./unsplash.js";
import { uploadMedia, findCategoryId, createPost } from "./wordpress.js";
import { createGoogleDocCopy } from "./googleDocs.js";
import { notifyPostCriado, notifyErro, notifyFalhaGeral } from "./discord.js";

async function produzirPauta({ config, client, cronograma, status, pauta, writerPrompt, brandVoice }) {
  console.log(`\n[${pauta.codigo}] (${pauta.vagaRotulo}) Pesquisando: ${pauta.titulo}`);
  const research = await researchTopic(client, pauta);

  console.log(`[${pauta.codigo}] Redigindo o post...`);
  const post = await writePost(client, { pauta, research, writerPrompt, brandVoice });

  console.log(`[${pauta.codigo}] Buscando imagem de capa na Unsplash...`);
  const image = await fetchCoverImage(config.unsplashAccessKey, post.focusKeyword || pauta.keyword);
  if (!image) {
    throw new Error(`Nenhuma imagem encontrada na Unsplash para "${post.focusKeyword || pauta.keyword}"`);
  }

  console.log(`[${pauta.codigo}] Subindo imagem e criando post no WordPress...`);
  const mediaId = await uploadMedia(config, {
    buffer: image.buffer,
    contentType: image.contentType,
    filename: image.filename,
    altText: post.title,
  });

  const categorySlug = categoriaDaPauta(cronograma, pauta);
  const categoryId = categorySlug ? await findCategoryId(config, categorySlug) : null;
  if (!categoryId) {
    console.warn(
      `[${pauta.codigo}] Categoria "${categorySlug}" não encontrada no WordPress — post ficará sem categoria.`
    );
  }

  const contentComCredito = `${post.contentHtml}\n\n<!-- ${image.credit} -->`;
  
  const { id: postId, editLink } = await createPost(config, {
    title: post.title,
    contentHtml: contentComCredito,
    excerpt: post.metaDescription,
    slug: post.slug,
    categoryId,
    featuredMediaId: mediaId,
  });

  let googleDocUrl = null;
  try {
    googleDocUrl = await createGoogleDocCopy(config, { title: post.title, contentHtml: post.contentHtml });
  } catch (docError) {
    console.warn(`[${pauta.codigo}] Cópia em Google Doc falhou (não bloqueante): ${docError.message}`);
  }

  marcarComoProduzida(status, pauta);
  await saveStatus(status);

  await notifyPostCriado(config.discordWebhookUrl, {
    pauta,
    title: post.title,
    editLink: googleDocUrl ? `${editLink}\nGoogle Doc: ${googleDocUrl}` : editLink,
    photographerCredit: image.credit.replace(/<[^>]+>/g, ""),
  });

  console.log(`[${pauta.codigo}] Post #${postId} criado como pending. ${editLink}`);
  return { postId, title: post.title, editLink };
}

async function main() {
  let config;

  try {
    config = loadConfig();
    const client = createAnthropicClient(config.anthropicApiKey);

    const writerPrompt = await readFile(path.resolve("data/prompt-agente-redator-seo.md"), "utf-8");
    const brandVoice = await readFile(path.resolve("data/referencia-tom-de-voz-marca-south.md"), "utf-8");

    const { vagasComOpcoes, status, cronograma } = await getNextPautas((ctx) =>
      generateNewPauta(client, ctx)
    );

    const totalPautas = vagasComOpcoes.reduce((soma, v) => soma + v.opcoes.length, 0);
    console.log(
      `Rodada da semana: ${vagasComOpcoes.length} vagas, ${totalPautas} textos a escrever.\n` +
        vagasComOpcoes
          .map((v) => `  ${v.vaga.rotulo}: ${v.opcoes.map((o) => o.codigo).join(", ")}`)
          .join("\n")
    );

    let criados = 0;
    let falhas = 0;

    for (const { vaga, opcoes } of vagasComOpcoes) {
      console.log(`\n===== Vaga ${vaga.id} (${vaga.rotulo}) — ${opcoes.length} opções =====`);
      for (const pauta of opcoes) {
        try {
          await produzirPauta({ config, client, cronograma, status, pauta, writerPrompt, brandVoice });
          criados += 1;
        } catch (error) {
          falhas += 1;
          console.error(`[${pauta.codigo || pauta.titulo}] Falhou:`, error);
          await notifyErro(config.discordWebhookUrl, { pauta, error });
          // Não marca como escrita — a próxima execução tenta essa pauta de novo.
          await saveStatus(status);
        }
      }
    }

    await saveStatus(status);
    console.log(`\nRodada encerrada: ${criados} rascunhos criados, ${falhas} falhas.`);

    if (falhas > 0) {
      process.exitCode = 1;
    }
  } catch (error) {
    // Falha geral: configuração ausente, arquivo de dados faltando, etc.
    // Se o webhook já é conhecido, avisa no Discord em vez de morrer calado —
    // foi assim que 11 execuções falharam sem ninguém perceber.
    console.error("Falha fatal no pipeline:", error);
    if (config?.discordWebhookUrl) {
      try {
        await notifyFalhaGeral(config.discordWebhookUrl, { error });
      } catch (avisoError) {
        console.error("Não consegui nem avisar no Discord:", avisoError);
      }
    }
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("Falha fatal no pipeline:", error);
  process.exitCode = 1;
});

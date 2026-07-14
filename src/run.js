import { readFile } from "node:fs/promises";
import path from "node:path";

import { loadConfig } from "./config.js";
import { getNextPautas, saveStatus, marcarComoProduzida } from "./queue.js";
import { createAnthropicClient, researchTopic, writePost, generateNewPauta } from "./anthropic.js";
import { fetchCoverImage } from "./unsplash.js";
import { uploadMedia, findCategoryId, createPost } from "./wordpress.js";
import { createGoogleDocCopy } from "./googleDocs.js";
import { notifyPostCriado, notifyErro } from "./discord.js";

async function main() {
  const config = loadConfig();
  const client = createAnthropicClient(config.anthropicApiKey);

  const writerPrompt = await readFile(path.resolve("data/prompt-agente-redator-seo.md"), "utf-8");
  const brandVoice = await readFile(path.resolve("data/referencia-tom-de-voz-marca-south.md"), "utf-8");

  const { selecionadas, status, cronograma } = await getNextPautas(config.postsPerRun, (ctx) =>
    generateNewPauta(client, ctx)
  );

  console.log(`Pautas selecionadas para esta rodada: ${selecionadas.map((p) => p.codigo || p.titulo).join(", ")}`);

  let algumaFalhou = false;

  for (const pauta of selecionadas) {
    try {
      console.log(`\n[${pauta.codigo}] Pesquisando: ${pauta.titulo}`);
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

      const categorySlug = cronograma.grade[String(pauta.diaSemana)]?.categoriaSlug;
      const categoryId = await findCategoryId(config, categorySlug);
      if (!categoryId) {
        console.warn(`[${pauta.codigo}] Categoria "${categorySlug}" não encontrada no WordPress — post ficará sem categoria.`);
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
    } catch (error) {
      algumaFalhou = true;
      console.error(`[${pauta.codigo || pauta.titulo}] Falhou:`, error);
      await notifyErro(config.discordWebhookUrl, { pauta, error });
      // Não marca como produzida — a próxima execução tenta essa pauta de novo.
      await saveStatus(status);
    }
  }

  if (algumaFalhou) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("Falha fatal no pipeline:", error);
  process.exitCode = 1;
});

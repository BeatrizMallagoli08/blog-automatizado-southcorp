function authHeader(config) {
  const token = Buffer.from(`${config.wpUsername}:${config.wpAppPassword}`).toString("base64");
  return `Basic ${token}`;
}

/**
 * Sobe a imagem de capa como mídia no WordPress (requer capability upload_files
 * liberada para o usuário Contributor do robô). Retorna o media_id.
 */
export async function uploadMedia(config, { buffer, contentType, filename, altText }) {
  const res = await fetch(`${config.wpSiteUrl}/wp-json/wp/v2/media`, {
    method: "POST",
    headers: {
      Authorization: authHeader(config),
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
    body: buffer,
  });

  if (!res.ok) {
    throw new Error(`Upload de mídia no WordPress falhou (${res.status}): ${await res.text()}`);
  }

  const media = await res.json();

  if (altText) {
    await fetch(`${config.wpSiteUrl}/wp-json/wp/v2/media/${media.id}`, {
      method: "POST",
      headers: {
        Authorization: authHeader(config),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ alt_text: altText }),
    }).catch(() => {});
  }

  return media.id;
}

/**
 * Busca uma categoria existente pelo slug. Não tenta criar categorias novas —
 * Contributor normalmente não tem a capability manage_categories, e criar
 * categorias fora do previsto poluiria a taxonomia do blog.
 */
export async function findCategoryId(config, slug) {
  if (!slug) return null;
  const url = new URL(`${config.wpSiteUrl}/wp-json/wp/v2/categories`);
  url.searchParams.set("slug", slug);

  const res = await fetch(url, { headers: { Authorization: authHeader(config) } });
  if (!res.ok) return null;

  const categories = await res.json();
  return categories?.[0]?.id ?? null;
}

/**
 * Cria o post como rascunho pendente de revisão ("pending"), nunca publicado direto.
 */
export async function createPost(config, { title, contentHtml, excerpt, slug, categoryId, featuredMediaId }) {
  const body = {
    title,
    content: contentHtml,
    excerpt,
    slug,
    status: "pending",
    featured_media: featuredMediaId,
  };
  if (categoryId) {
    body.categories = [categoryId];
  }

  const res = await fetch(`${config.wpSiteUrl}/wp-json/wp/v2/posts`, {
    method: "POST",
    headers: {
      Authorization: authHeader(config),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Criação do post no WordPress falhou (${res.status}): ${await res.text()}`);
  }

  const post = await res.json();
  return {
    id: post.id,
    editLink: `${config.wpSiteUrl}/wp-admin/post.php?post=${post.id}&action=edit`,
  };
}

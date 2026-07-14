const UNSPLASH_API = "https://api.unsplash.com";

/**
 * Busca uma foto no Unsplash pela palavra-chave e baixa o arquivo.
 * Retorna { buffer, contentType, filename, credit } ou null se nada for encontrado.
 */
export async function fetchCoverImage(accessKey, keyword) {
  const searchUrl = new URL(`${UNSPLASH_API}/search/photos`);
  searchUrl.searchParams.set("query", keyword);
  searchUrl.searchParams.set("per_page", "1");
  searchUrl.searchParams.set("orientation", "landscape");
  searchUrl.searchParams.set("content_filter", "high");

  const searchRes = await fetch(searchUrl, {
    headers: { Authorization: `Client-ID ${accessKey}` },
  });
  if (!searchRes.ok) {
    throw new Error(`Unsplash search falhou (${searchRes.status}): ${await searchRes.text()}`);
  }
  const searchData = await searchRes.json();
  const photo = searchData.results?.[0];
  if (!photo) {
    return null;
  }

  // Boas práticas da API Unsplash: sinalizar o download antes de usar a imagem
  if (photo.links?.download_location) {
    await fetch(photo.links.download_location, {
      headers: { Authorization: `Client-ID ${accessKey}` },
    }).catch(() => {});
  }

  const imageRes = await fetch(photo.urls.regular);
  if (!imageRes.ok) {
    throw new Error(`Download da imagem Unsplash falhou (${imageRes.status})`);
  }
  const buffer = Buffer.from(await imageRes.arrayBuffer());
  const contentType = imageRes.headers.get("content-type") || "image/jpeg";

  const photographerName = photo.user?.name || "Unsplash";
  const photographerUrl = `${photo.user?.links?.html || "https://unsplash.com"}?utm_source=south_blog&utm_medium=referral`;

  return {
    buffer,
    contentType,
    filename: `${photo.id}.jpg`,
    credit: `Foto: <a href="${photographerUrl}" target="_blank" rel="noopener">${photographerName}</a> via Unsplash`,
  };
}

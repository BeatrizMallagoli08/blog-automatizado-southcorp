import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-opus-4-8";

export function createAnthropicClient(apiKey) {
  return new Anthropic({ apiKey });
}

/**
 * Etapa 1 — Pesquisa: usa a tool de busca web para levantar dados atuais
 * (leis, números, fontes oficiais) sobre o tema da pauta.
 */
export async function researchTopic(client, pauta) {
  const briefing = [
    `Tema: ${pauta.titulo}`,
    `Palavra-chave foco: ${pauta.keyword}`,
    `Tópicos a cobrir (H2s): ${pauta.h2s.join("; ")}`,
    pauta.backlinkExterno ? `Fonte externa sugerida: ${pauta.backlinkExterno}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system:
      "Você é um pesquisador que levanta dados atuais e precisos (leis vigentes, números oficiais, decisões judiciais, estatísticas do setor de seguros/riscos corporativos no Brasil) para embasar um artigo de blog B2B. " +
      "Priorize fontes oficiais (Gov.br, STJ, STF, Banco Central, Receita Federal, CBIC) e notícias recentes quando o tema envolver newsjacking. " +
      "Responda em português, em formato de lista objetiva de achados com a fonte de cada um — sem redigir o artigo, apenas o material de pesquisa.",
    tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 5 }],
    messages: [
      {
        role: "user",
        content: `Pesquise dados atuais e relevantes para o seguinte briefing de post de blog:\n\n${briefing}`,
      },
    ],
  });

  return response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n\n");
}

const GENERATE_POST_TOOL = {
  name: "generate_post",
  description: "Estrutura completa do post de blog gerado, pronta para publicação no WordPress.",
  input_schema: {
    type: "object",
    properties: {
      metaDescription: {
        type: "string",
        description: "Meta description sugerida, máximo 155 caracteres, focada em cliques.",
      },
      focusKeyword: { type: "string", description: "Palavra-chave foco do post." },
      secondaryKeywords: {
        type: "array",
        items: { type: "string" },
        description: "Palavras-chave secundárias mapeadas.",
      },
      internalLinks: {
        type: "array",
        items: { type: "string" },
        description: "Sugestões de linkagem interna (outros posts/páginas de serviço Southcorp).",
      },
      externalLinks: {
        type: "array",
        items: { type: "string" },
        description: "Sugestões de linkagem externa (fontes oficiais de alta autoridade).",
      },
      title: { type: "string", description: "Título do post (H1), otimizado para SEO." },
      slug: { type: "string", description: "Slug amigável em kebab-case, sem acentos." },
      contentHtml: {
        type: "string",
        description:
          "Corpo completo do artigo em HTML válido (use apenas <h2>, <h3>, <p>, <ul>, <li>, <strong>, <table> quando pertinente), pronto para o campo content do WordPress. Não inclua o H1 no corpo.",
      },
    },
    required: [
      "metaDescription",
      "focusKeyword",
      "secondaryKeywords",
      "internalLinks",
      "externalLinks",
      "title",
      "slug",
      "contentHtml",
    ],
  },
};

/**
 * Etapa 2 — Redação: usa o prompt do agente redator SEO + manual de marca
 * como contexto, e força saída estruturada via tool use.
 */
export async function writePost(client, { pauta, research, writerPrompt, brandVoice }) {
  const briefing = [
    `Código da pauta: ${pauta.codigo}`,
    `Tema/título sugerido: ${pauta.titulo}`,
    `Palavra-chave foco: ${pauta.keyword}`,
    `H2s sugeridos: ${pauta.h2s.join("; ")}`,
    pauta.backlinkExterno ? `Backlink externo sugerido: ${pauta.backlinkExterno}` : null,
    pauta.backlinkInterno ? `Backlink interno sugerido: ${pauta.backlinkInterno}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 8192,
    system: writerPrompt,
    tools: [GENERATE_POST_TOOL],
    tool_choice: { type: "tool", name: "generate_post" },
    messages: [
      {
        role: "user",
        content:
          `# Manual de marca South (contexto fixo)\n\n${brandVoice}\n\n` +
          `# Briefing da pauta de hoje\n\n${briefing}\n\n` +
          `# Pesquisa levantada (dados atuais, use como embasamento)\n\n${research}\n\n` +
          `Gere o post completo chamando a tool generate_post.`,
      },
    ],
  });

  const toolUse = response.content.find((block) => block.type === "tool_use");
  if (!toolUse) {
    throw new Error("A API não retornou o tool_use esperado (generate_post).");
  }
  return toolUse.input;
}

const PROPOSE_PAUTA_TOOL = {
  name: "propose_pauta",
  description: "Nova pauta de blog proposta, seguindo a mesma lógica do cronograma editorial.",
  input_schema: {
    type: "object",
    properties: {
      titulo: { type: "string", description: "Título/tema do post." },
      keyword: { type: "string", description: "Palavra-chave de cauda longa com intenção comercial." },
      h2s: {
        type: "array",
        items: { type: "string" },
        minItems: 3,
        maxItems: 3,
        description: "Três tópicos H2 que o artigo deve cobrir.",
      },
      backlinkExterno: { type: ["string", "null"], description: "Fonte externa oficial sugerida, ou null." },
      backlinkInterno: { type: ["string", "null"], description: "Página/post interno sugerido, ou null." },
    },
    required: ["titulo", "keyword", "h2s", "backlinkExterno", "backlinkInterno"],
  },
};

/**
 * Etapa 0 (quando a fila pré-escrita acaba) — pesquisa e propõe uma pauta nova
 * seguindo a frente do dia da semana e a proporção de produto (40/30/30).
 */
export async function generateNewPauta(client, { diaSemana, frenteInfo, produto, status }) {
  const jaUsados = [
    ...status.generatedPautas.map((p) => p.titulo),
  ].join("; ") || "nenhum ainda";

  const research = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system:
      "Você pesquisa notícias e temas atuais e relevantes para um blog B2B de seguros corporativos no Brasil (South Group), " +
      "priorizando leis novas, decisões judiciais recentes, dados econômicos e riscos setoriais do Sul do Brasil.",
    tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 3 }],
    messages: [
      {
        role: "user",
        content:
          `Levante 2-3 temas atuais e relevantes para a frente "${frenteInfo.frente}" (foco: ${frenteInfo.foco}), ` +
          `relacionados ao produto "${produto}" da South. Já foram usados: ${jaUsados}. Não repita temas.`,
      },
    ],
  });

  const researchText = research.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n\n");

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system:
      "Você propõe pautas de blog para a South (corretora de seguros corporativos B2B), seguindo rigorosamente o formato do cronograma editorial existente: " +
      "palavra-chave de cauda longa com intenção comercial, três H2s objetivos, e sugestão de backlink externo (fonte oficial) e/ou interno.",
    tools: [PROPOSE_PAUTA_TOOL],
    tool_choice: { type: "tool", name: "propose_pauta" },
    messages: [
      {
        role: "user",
        content:
          `Frente do dia: ${frenteInfo.frente}\nFoco: ${frenteInfo.foco}\nProduto a priorizar: ${produto}\n\n` +
          `Pesquisa de temas atuais:\n${researchText}\n\nProponha UMA pauta nova, específica e não genérica.`,
      },
    ],
  });

  const toolUse = response.content.find((block) => block.type === "tool_use");
  if (!toolUse) {
    throw new Error("A API não retornou o tool_use esperado (propose_pauta).");
  }
  return toolUse.input;
}

import { CATEGORIAS, getUltimasEdicoes } from "./temas.js";

const MODEL = "claude-opus-4-8";

const ESCOLHER_TEMA_TOOL = {
  name: "escolher_tema",
  description: "Tema escolhido para a edição do mês da página editorial do Sinduscon, com categoria e justificativa.",
  input_schema: {
    type: "object",
    properties: {
      tema: { type: "string", description: "Tema específico da edição (não genérico, não é o nome de uma categoria)." },
      categoria: {
        type: "string",
        description:
          `Eixo temático da edição. Prefira um destes quando fizer sentido: ${CATEGORIAS.join(", ")}. ` +
          "Só use outro rótulo curto se o tema realmente não se encaixar em nenhum.",
      },
      justificativa: {
        type: "string",
        description:
          "Por que esse tema é relevante e duradouro para o público de construção civil/engenharia (não apenas notícia da semana), " +
          "e por que ele não repete nem fica parecido com os temas/categorias usados recentemente.",
      },
    },
    required: ["tema", "categoria", "justificativa"],
  },
};

/**
 * Etapa 1 — Pesquisa + escolha do tema: usa web_search para levantar assuntos
 * duradouros e relevantes para o setor (não presos à notícia da semana, já
 * que a revista circula 1-2 meses depois de escrita), evitando repetir os
 * temas/categorias das últimas edições.
 */
export async function researchAndChooseTema(client, { historico }) {
  const recentes = getUltimasEdicoes(historico, 6);
  const recentesTexto = recentes.length
    ? recentes.map((e) => `- ${e.mesAno}: "${e.tema}" (categoria: ${e.categoria})`).join("\n")
    : "nenhuma edição anterior registrada";

  const research = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system:
      "Você pesquisa temas relevantes e DURADOUROS para o público de construção civil, engenharia e infraestrutura no Brasil, " +
      "para uma página editorial de revista impressa mensal que circula 1-2 meses depois de escrita. " +
      "Priorize tendências estruturais, mudanças regulatórias em curso, dados setoriais e discussões que continuarão relevantes daqui a 2-3 meses " +
      "— evite temas presos à notícia da semana. O tema NÃO precisa (e de preferência não deve) ser sobre seguros. " +
      "Responda em português, em formato de lista objetiva de 3-5 temas candidatos com uma frase de justificativa cada.",
    tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 5 }],
    messages: [
      {
        role: "user",
        content:
          "Levante temas candidatos para a próxima edição da página editorial do Sinduscon.\n\n" +
          `Edições recentes (não repita nem fique parecido com estas, principalmente com a categoria da edição imediatamente anterior):\n${recentesTexto}`,
      },
    ],
  });

  const researchText = research.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n\n");

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system:
      "Você escolhe UM tema específico e não genérico para a edição do mês da página editorial do Sinduscon, " +
      "a partir de uma lista de temas candidatos já pesquisados.",
    tools: [ESCOLHER_TEMA_TOOL],
    tool_choice: { type: "tool", name: "escolher_tema" },
    messages: [
      {
        role: "user",
        content:
          `Temas candidatos pesquisados:\n${researchText}\n\n` +
          `Edições recentes (para evitar repetição):\n${recentesTexto}\n\n` +
          "Escolha UM tema chamando a tool escolher_tema.",
      },
    ],
  });

  const toolUse = response.content.find((block) => block.type === "tool_use");
  if (!toolUse) {
    throw new Error("A API não retornou o tool_use esperado (escolher_tema).");
  }
  return { ...toolUse.input, research: researchText };
}

const ESCREVER_EDITORIAL_TOOL = {
  name: "gerar_pagina_editorial",
  description: "Página editorial completa da revista, seguindo a estrutura obrigatória de 10 partes.",
  input_schema: {
    type: "object",
    properties: {
      estrategiaEditorial: { type: "string", description: "Parte 1 — insight que sustenta a página, relevância para o público Sinduscon, como a Southcorp entra naturalmente." },
      conceitoCriativo: { type: "string", description: "Parte 2 — a grande ideia que orienta texto e direção de arte." },
      headline: { type: "string", description: "Parte 3 — curta (4-10 palavras), desperta curiosidade intelectual, sem clichês." },
      linhaApoio: { type: "string", description: "Parte 4 — expande a headline, mostra por que o tema importa." },
      corpoEditorialHtml: {
        type: "string",
        description:
          "Parte 5 — corpo editorial completo em HTML válido (use apenas <p>, <h3>, <ul>, <li>, <strong>), como reportagem institucional: " +
          "parágrafos curtos, narrativa progressiva, exemplos reais/plausíveis. A Southcorp só aparece depois do problema construído.",
      },
      frasesDestacaveis: {
        type: "array",
        items: { type: "string" },
        minItems: 2,
        maxItems: 4,
        description: "Parte 6 — 2 a 4 frases curtas para uso como pull quote/box editorial, que funcionem isoladas.",
      },
      direcaoArte: { type: "string", description: "Parte 7 — sugestão de imagem principal, infográficos, boxes, destaques, hierarquia visual (pensando em página impressa)." },
      fechamento: { type: "string", description: "Parte 8 — reforça o aprendizado principal; a Southcorp como consequência lógica da reflexão." },
      cta: { type: "string", description: "Parte 9 — elegante, nunca agressivo (conversar com especialista, material técnico, diagnóstico, QR Code)." },
    },
    required: [
      "estrategiaEditorial",
      "conceitoCriativo",
      "headline",
      "linhaApoio",
      "corpoEditorialHtml",
      "frasesDestacaveis",
      "direcaoArte",
      "fechamento",
      "cta",
    ],
  },
};

/**
 * Etapa 2 — Redação: usa o prompt do Diretor Editorial + manual de marca como
 * contexto, e força saída estruturada nas 10 partes via tool use.
 * A parte 10 (Assinatura Institucional) é fixa e não depende do modelo.
 */
export async function writeEditorial(client, { tema, categoria, justificativa, research, editorPrompt, brandVoice }) {
  const briefing = [`Tema escolhido: ${tema}`, `Categoria/eixo: ${categoria}`, `Justificativa: ${justificativa}`].join("\n");

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 8192,
    system: editorPrompt,
    tools: [ESCREVER_EDITORIAL_TOOL],
    tool_choice: { type: "tool", name: "gerar_pagina_editorial" },
    messages: [
      {
        role: "user",
        content:
          `# Manual de marca South (contexto fixo)\n\n${brandVoice}\n\n` +
          `# Briefing da edição deste mês\n\n${briefing}\n\n` +
          `# Pesquisa levantada (dados atuais, use como embasamento)\n\n${research}\n\n` +
          "Gere a página editorial completa chamando a tool gerar_pagina_editorial.",
      },
    ],
  });

  const toolUse = response.content.find((block) => block.type === "tool_use");
  if (!toolUse) {
    throw new Error("A API não retornou o tool_use esperado (gerar_pagina_editorial).");
  }
  return toolUse.input;
}

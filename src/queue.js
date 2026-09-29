import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const CRONOGRAMA_PATH = path.resolve("data/pautas-cronograma.json");
const STATUS_PATH = path.resolve("status.json");

// Produtos que podem ocupar uma vaga de "tema diverso", em rodízio, para o
// blog não virar monotema. Seguro Garantia não entra aqui: ele já tem duas
// vagas próprias e reservadas toda semana.
const RODIZIO_DIVERSOS = ["Engenharia", "RC", "Institucional"];

export async function loadCronograma() {
  const raw = await readFile(CRONOGRAMA_PATH, "utf-8");
  return JSON.parse(raw);
}

export async function loadStatus() {
  const raw = await readFile(STATUS_PATH, "utf-8");
  const status = JSON.parse(raw);
  // Campos que podem faltar num status.json antigo. Sem isso, a primeira
  // rodada depois de uma mudança de formato quebra em algo bobo.
  status.producedCodes ??= [];
  status.generatedPautas ??= [];
  status.productCounts ??= {};
  status.runCount ??= 0;
  return status;
}

export async function saveStatus(status) {
  await writeFile(STATUS_PATH, JSON.stringify(status, null, 2) + "\n", "utf-8");
}

/**
 * Frente editorial da rodada, em rodízio pelas frentes da grade. A frente
 * define o ÂNGULO do texto (notícia, pessoas, governança, operação,
 * bastidores); o produto define o ASSUNTO. São coisas diferentes.
 */
function frentePara(cronograma, indice) {
  const chaves = Object.keys(cronograma.grade).sort();
  return cronograma.grade[chaves[indice % chaves.length]];
}

/**
 * Monta a rodada da semana: para cada vaga, `opcoesPorVaga` pautas
 * DIFERENTES entre si (mesmo tema, assuntos distintos), para escolha
 * editorial depois. Usa a fila pré-escrita enquanto houver pauta daquele
 * produto; quando ela acaba, pede pauta nova ao gerador.
 *
 * Retorna as vagas com suas opções, além do status e do cronograma.
 */
export async function getNextPautas(gerarPauta) {
  const cronograma = await loadCronograma();
  const status = await loadStatus();

  const { opcoesPorVaga, vagas } = cronograma.semana;

  const jaEscritas = new Set(status.producedCodes);
  const escolhidasAgora = new Set();
  const vagasComOpcoes = [];

  for (const [indiceVaga, vaga] of vagas.entries()) {
    const opcoes = [];

    for (let i = 0; i < opcoesPorVaga; i++) {
      const giro = status.runCount + indiceVaga + i;
      const produto =
        vaga.produto ?? RODIZIO_DIVERSOS[giro % RODIZIO_DIVERSOS.length];

      const daFila = cronograma.pautas.find(
        (p) =>
          p.produto === produto &&
          !jaEscritas.has(p.codigo) &&
          !escolhidasAgora.has(p.codigo)
      );

      if (daFila) {
        escolhidasAgora.add(daFila.codigo);
        opcoes.push({
          ...daFila,
          origem: "cronograma",
          vaga: vaga.id,
          vagaRotulo: vaga.rotulo,
        });
        continue;
      }

      // Fila pré-escrita esgotada para este produto: gera pauta nova.
      // `evitar` é o que impede as três opções da mesma vaga de nascerem
      // parecidas -- sem isso, três chamadas independentes com o mesmo
      // briefing devolvem praticamente o mesmo assunto.
      const evitar = [
        ...opcoes.map((o) => o.titulo),
        ...status.generatedPautas.slice(-40).map((p) => p.titulo),
      ];

      const nova = await gerarPauta({
        produto,
        frenteInfo: frentePara(cronograma, giro),
        evitar,
        vaga,
      });

      const codigo = `G${String(status.generatedPautas.length + 1).padStart(3, "0")}`;
      const completa = {
        ...nova,
        codigo,
        produto,
        origem: "gerada",
        vaga: vaga.id,
        vagaRotulo: vaga.rotulo,
      };

      status.generatedPautas.push(completa);
      opcoes.push(completa);
    }

    vagasComOpcoes.push({ vaga, opcoes });
  }

  status.runCount += 1;

  return { vagasComOpcoes, status, cronograma };
}

/**
 * Slug da categoria no WordPress para a pauta, pelo PRODUTO dela.
 * O site da Southcorp organiza as categorias por produto, não por frente
 * do dia -- então é o produto que manda. Sem correspondência, devolve null
 * e o post é criado sem categoria (o pipeline não trava por isso).
 */
export function categoriaDaPauta(cronograma, pauta) {
  const mapa = cronograma.categoriaPorProduto || {};
  const slug = mapa[pauta.produto];
  return typeof slug === "string" ? slug : null;
}

/**
 * Marca a pauta como JÁ ESCRITA (virou rascunho no WordPress), que não é o
 * mesmo que publicada: das três opções de uma vaga, só uma costuma ir ao ar,
 * mas as três já foram escritas e não devem voltar na fila.
 */
export function marcarComoProduzida(status, pauta) {
  if (pauta.origem === "cronograma" && !status.producedCodes.includes(pauta.codigo)) {
    status.producedCodes.push(pauta.codigo);
  }
  const produto = pauta.produto;
  if (produto) {
    status.productCounts[produto] = (status.productCounts[produto] || 0) + 1;
  }
  status.lastRun = new Date().toISOString();
}

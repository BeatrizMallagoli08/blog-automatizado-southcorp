import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const CRONOGRAMA_PATH = path.resolve("data/pautas-cronograma.json");
const STATUS_PATH = path.resolve("status.json");

// Proporção-alvo de produto definida no prompt do redator (40% Garantia / 30% Engenharia / 30% RC)
const PRODUCT_TARGETS = { Garantia: 0.4, Engenharia: 0.3, RC: 0.3 };

export async function loadCronograma() {
  const raw = await readFile(CRONOGRAMA_PATH, "utf-8");
  return JSON.parse(raw);
}

export async function loadStatus() {
  const raw = await readFile(STATUS_PATH, "utf-8");
  return JSON.parse(raw);
}

export async function saveStatus(status) {
  await writeFile(STATUS_PATH, JSON.stringify(status, null, 2) + "\n", "utf-8");
}

function pickNextProduct(productCounts) {
  const total = Object.values(productCounts).reduce((a, b) => a + b, 0) || 1;
  let worstProduct = "Garantia";
  let worstGap = -Infinity;
  for (const [produto, target] of Object.entries(PRODUCT_TARGETS)) {
    const current = (productCounts[produto] || 0) / total;
    const gap = target - current;
    if (gap > worstGap) {
      worstGap = gap;
      worstProduct = produto;
    }
  }
  return worstProduct;
}

/**
 * Retorna as próximas `count` pautas a produzir, na ordem seg-sex.
 * Usa a fila pré-escrita primeiro; quando ela acaba, pede pautas novas
 * ao gerador (callback) seguindo a frente do dia da semana e a proporção de produto.
 */
export async function getNextPautas(count, generateNewPauta) {
  const cronograma = await loadCronograma();
  const status = await loadStatus();

  const pendentes = cronograma.pautas.filter(
    (p) => !status.producedCodes.includes(p.codigo)
  );

  const selecionadas = [];
  // Cópia local dos contadores: incrementada a cada pauta NOVA gerada nesta
  // mesma rodada, para que a proporção 40/30/30 seja respeitada dentro do
  // próprio lote (status.productCounts só reflete pautas já publicadas).
  const contadoresLocais = { ...status.productCounts };

  for (let i = 0; i < count; i++) {
    if (pendentes[i]) {
      selecionadas.push({ ...pendentes[i], origem: "cronograma" });
      continue;
    }

    // Fila pré-escrita esgotada: gera pauta nova para o dia correspondente
    const diaSemana = ((selecionadas.length + startWeekday(cronograma, status)) % 5) + 1;
    const frenteInfo = cronograma.grade[String(diaSemana)];
    const produto = pickNextProduct(contadoresLocais);
    contadoresLocais[produto] = (contadoresLocais[produto] || 0) + 1;

    const novaPauta = await generateNewPauta({ diaSemana, frenteInfo, produto, status });
    const codigo = `G${String(status.generatedPautas.length + 1).padStart(3, "0")}`;
    const pautaCompleta = { ...novaPauta, codigo, diaSemana, produto, origem: "gerada" };

    status.generatedPautas.push(pautaCompleta);
    selecionadas.push(pautaCompleta);
  }

  return { selecionadas, status, cronograma };
}

function startWeekday(cronograma, status) {
  const produzidas = status.producedCodes.length;
  return produzidas % 5;
}

export function marcarComoProduzida(status, pauta) {
  if (pauta.origem === "cronograma") {
    status.producedCodes.push(pauta.codigo);
  }
  const produto = pauta.produto;
  if (produto && status.productCounts[produto] !== undefined) {
    status.productCounts[produto] += 1;
  }
  status.lastRun = new Date().toISOString();
}

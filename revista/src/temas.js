import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const HISTORICO_PATH = path.resolve("revista/temas-revista-usados.json");

// Lista fixa de eixos temáticos sugerida no brief, usada para estruturar o
// controle de repetição (o agente também pode registrar uma categoria fora
// desta lista, se o tema do mês realmente não se encaixar em nenhuma).
export const CATEGORIAS = [
  "Segurança",
  "Contratos e Riscos Jurídicos",
  "Sustentabilidade",
  "Produtividade e Custos",
  "Inovação",
  "Continuidade Operacional",
  "Legislação",
];

export async function loadHistorico() {
  const raw = await readFile(HISTORICO_PATH, "utf-8");
  return JSON.parse(raw);
}

export async function saveHistorico(historico) {
  await writeFile(HISTORICO_PATH, JSON.stringify(historico, null, 2) + "\n", "utf-8");
}

/** Últimas `n` edições, da mais recente para a mais antiga. */
export function getUltimasEdicoes(historico, n = 6) {
  return [...historico.edicoes].slice(-n).reverse();
}

export function registrarEdicao(historico, edicao) {
  historico.edicoes.push(edicao);
}

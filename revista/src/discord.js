import { send } from "../../src/discord.js";

export async function notifyEdicaoPronta(webhookUrl, { mesAno, tema, categoria, googleDocUrl, clickupTaskUrl }) {
  await send(webhookUrl, {
    embeds: [
      {
        title: `📰 Edição de ${mesAno} pronta para revisão`,
        color: 0x2b6cb0,
        fields: [
          { name: "Tema", value: tema, inline: false },
          { name: "Categoria/eixo", value: categoria, inline: false },
          ...(googleDocUrl ? [{ name: "Google Doc", value: googleDocUrl, inline: false }] : []),
          { name: "Task no ClickUp", value: clickupTaskUrl, inline: false },
        ],
        timestamp: new Date().toISOString(),
      },
    ],
  });
}

export async function notifyErro(webhookUrl, { mesAno, error }) {
  await send(webhookUrl, {
    embeds: [
      {
        title: "⚠️ Falha ao gerar a edição da revista",
        color: 0xe53e3e,
        fields: [
          { name: "Edição", value: mesAno || "desconhecida", inline: false },
          { name: "Erro", value: String(error?.message || error).slice(0, 1000), inline: false },
        ],
        timestamp: new Date().toISOString(),
      },
    ],
  });
}

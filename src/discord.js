export async function send(webhookUrl, payload) {
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    // Não derruba o pipeline por falha de notificação — só loga.
    console.error(`Falha ao notificar o Discord (${res.status}): ${await res.text()}`);
  }
}

export async function notifyPostCriado(webhookUrl, { pauta, title, editLink, photographerCredit }) {
  await send(webhookUrl, {
    embeds: [
      {
        title: "📝 Novo post pronto para revisão",
        color: 0x2b6cb0,
        fields: [
          ...(pauta?.vagaRotulo ? [{ name: "Vaga da semana", value: pauta.vagaRotulo, inline: false }] : []),
          { name: "Pauta", value: pauta.titulo, inline: false },
          { name: "Título gerado", value: title, inline: false },
          { name: "Link de edição no WP admin", value: editLink, inline: false },
          ...(photographerCredit ? [{ name: "Crédito da imagem", value: photographerCredit, inline: false }] : []),
        ],
        timestamp: new Date().toISOString(),
      },
    ],
  });
}

/**
 * Falha que derruba a rodada inteira (secret faltando, arquivo de dados
 * ausente). Sem este aviso, o robô falha em silêncio e ninguém percebe:
 * foi o que aconteceu por 11 semanas seguidas.
 */
export async function notifyFalhaGeral(webhookUrl, { error }) {
  await send(webhookUrl, {
    embeds: [
      {
        title: "🚨 A rodada do blog não rodou",
        color: 0xe53e3e,
        fields: [
          {
            name: "O que aconteceu",
            value: String(error?.message || error).slice(0, 1000),
            inline: false,
          },
          {
            name: "Onde olhar",
            value: "GitHub > Actions > última execução > passo da geração de posts",
            inline: false,
          },
        ],
        timestamp: new Date().toISOString(),
      },
    ],
  });
}

export async function notifyErro(webhookUrl, { pauta, error }) {
  await send(webhookUrl, {
    embeds: [
      {
        title: "⚠️ Falha ao gerar post",
        color: 0xe53e3e,
        fields: [
          { name: "Pauta", value: pauta?.titulo || pauta?.codigo || "desconhecida", inline: false },
          { name: "Erro", value: String(error?.message || error).slice(0, 1000), inline: false },
        ],
        timestamp: new Date().toISOString(),
      },
    ],
  });
}

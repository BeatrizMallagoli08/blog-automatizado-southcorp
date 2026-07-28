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
          { name: "Tema do dia", value: pauta.titulo, inline: false },
          { name: "Título gerado", value: title, inline: false },
          { name: "Link de edição no WP admin", value: editLink, inline: false },
          ...(photographerCredit ? [{ name: "Crédito da imagem", value: photographerCredit, inline: false }] : []),
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

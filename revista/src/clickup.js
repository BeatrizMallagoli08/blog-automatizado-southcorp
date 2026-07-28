/**
 * Cria a task mensal no ClickUp com status inicial "Aprovar" (status
 * customizado que precisa já existir na Lista — ver revista/README.md).
 */
export async function createClickUpTask(config, { name, description, dueDateMs }) {
  const res = await fetch(`https://api.clickup.com/api/v2/list/${config.clickupListId}/task`, {
    method: "POST",
    headers: {
      Authorization: config.clickupApiToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name,
      description,
      status: "Aprovar",
      due_date: dueDateMs,
      due_date_time: true,
    }),
  });

  if (!res.ok) {
    throw new Error(`Falha ao criar task no ClickUp (${res.status}): ${await res.text()}`);
  }

  const data = await res.json();
  return { id: data.id, url: data.url };
}

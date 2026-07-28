function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  }
  return value;
}

export function loadConfig() {
  return {
    anthropicApiKey: required("ANTHROPIC_API_KEY"),
    // Opcionais: sem eles, o pipeline simplesmente pula a cópia em Google Doc
    // e manda o texto completo só na task do ClickUp.
    googleServiceAccountJson: process.env.GOOGLE_SERVICE_ACCOUNT_JSON || null,
    googleDriveFolderId: process.env.GOOGLE_DRIVE_FOLDER_ID_REVISTA || null,
    clickupApiToken: required("CLICKUP_API_TOKEN"),
    clickupListId: required("CLICKUP_LIST_ID"),
    discordWebhookUrl: required("DISCORD_WEBHOOK_URL_REVISTA"),
  };
}

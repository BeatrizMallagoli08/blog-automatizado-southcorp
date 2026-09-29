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
    wpSiteUrl: required("WP_SITE_URL").replace(/\/+$/, ""),
    wpUsername: required("WP_USERNAME"),
    wpAppPassword: required("WP_APPLICATION_PASSWORD"),
    discordWebhookUrl: required("DISCORD_WEBHOOK_URL"),
    unsplashAccessKey: required("UNSPLASH_ACCESS_KEY"),
    googleServiceAccountJson: process.env.GOOGLE_SERVICE_ACCOUNT_JSON || null,
    googleDriveFolderId: process.env.GOOGLE_DRIVE_FOLDER_ID || null,
  };
}

import { createSign } from "node:crypto";

function base64url(input) {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function getAccessToken(serviceAccount) {
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const claim = base64url(
    JSON.stringify({
      iss: serviceAccount.client_email,
      scope: "https://www.googleapis.com/auth/drive.file",
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now,
    })
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claim}`);
  signer.end();
  const signature = base64url(signer.sign(serviceAccount.private_key));
  const jwt = `${header}.${claim}.${signature}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) {
    throw new Error(`Falha ao autenticar Service Account do Google (${res.status}): ${await res.text()}`);
  }
  const data = await res.json();
  return data.access_token;
}

/**
 * Cria uma cópia do post em Google Doc (conversão automática de HTML pelo Drive API)
 * na pasta configurada. Retorna a URL do doc, ou null se as credenciais não estiverem configuradas.
 */
export async function createGoogleDocCopy(config, { title, contentHtml }) {
  if (!config.googleServiceAccountJson) {
    return null;
  }

  const serviceAccount = JSON.parse(config.googleServiceAccountJson);
  const accessToken = await getAccessToken(serviceAccount);

  const metadata = {
    name: title,
    mimeType: "application/vnd.google-apps.document",
    ...(config.googleDriveFolderId ? { parents: [config.googleDriveFolderId] } : {}),
  };

  const boundary = "southblog" + Date.now();
  const multipartBody =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: text/html; charset=UTF-8\r\n\r\n` +
    `<html><body>${contentHtml}</body></html>\r\n` +
    `--${boundary}--`;

  const res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body: multipartBody,
  });

  if (!res.ok) {
    throw new Error(`Falha ao criar cópia no Google Docs (${res.status}): ${await res.text()}`);
  }

  const file = await res.json();
  return `https://docs.google.com/document/d/${file.id}/edit`;
}

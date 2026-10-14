export type ZproConnectionAddress = {
  baseUrl: string;
  apiId: string;
  extractedApiId: boolean;
};

function validatePublicHostname(hostname: string) {
  const normalized = hostname.toLowerCase();
  const privateIpv4 =
    /^(10\.|127\.|169\.254\.|192\.168\.|0\.)/.test(normalized) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(normalized);

  if (
    normalized === "localhost" ||
    normalized === "::1" ||
    normalized.endsWith(".local") ||
    privateIpv4
  ) {
    throw new Error("A URL deve apontar para o backend público da sua ZPRO.");
  }
}

export function normalizeZproApiId(value: string) {
  const apiId = value.trim();
  if (!apiId) return "";
  if (apiId.length > 120 || !/^[A-Za-z0-9._:-]+$/.test(apiId)) {
    throw new Error("O ApiID da ZPRO é inválido.");
  }
  return apiId;
}

export function parseZproConnectionAddress(
  value: string,
  providedApiId = "",
): ZproConnectionAddress {
  const url = new URL(value.trim());
  if (url.protocol !== "https:") {
    throw new Error("A URL do backend da ZPRO deve usar HTTPS.");
  }
  if (url.username || url.password) {
    throw new Error("A URL não pode conter usuário ou senha.");
  }
  if (url.search || url.hash) {
    throw new Error("A URL do backend não pode conter parâmetros ou fragmentos.");
  }

  validatePublicHostname(url.hostname);

  const path = url.pathname.replace(/\/+$/, "");
  const endpointMatch = path.match(/^\/v2\/api\/external\/([^/]+)$/);
  if (path && path !== "/" && !endpointMatch) {
    throw new Error(
      "Informe apenas a URL do backend ou o endpoint completo /v2/api/external/ApiID.",
    );
  }

  const extractedApiId = endpointMatch
    ? normalizeZproApiId(decodeURIComponent(endpointMatch[1]))
    : "";
  const explicitApiId = normalizeZproApiId(providedApiId);
  if (extractedApiId && explicitApiId && extractedApiId !== explicitApiId) {
    throw new Error("O ApiID informado é diferente do ApiID presente na URL.");
  }

  return {
    baseUrl: url.origin,
    apiId: extractedApiId || explicitApiId,
    extractedApiId: Boolean(extractedApiId),
  };
}

export function maskZproApiId(apiId: string) {
  if (!apiId) return "";
  if (apiId.length <= 4) return "••••";
  return `••••${apiId.slice(-4)}`;
}

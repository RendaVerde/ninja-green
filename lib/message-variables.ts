import type { Lead } from "@/lib/demo-data";

export type MessageContact = Pick<Lead, "name" | "phone" | "email" | "interest" | "kind" | "origin" | "status" | "note">;

export type MessageVariable = {
  key: string;
  label: string;
  description: string;
  example: string;
  sourceField: keyof MessageContact;
  resolve?: (contact: MessageContact) => string;
};

export const messageVariables: readonly MessageVariable[] = [
  { key: "nome", label: "Primeiro nome", description: "Primeiro nome do contato.", example: "Mariana", sourceField: "name", resolve: (contact) => contact.name.trim().split(/\s+/)[0] || "" },
  { key: "nome_completo", label: "Nome completo", description: "Nome completo informado no cadastro.", example: "Mariana Alves", sourceField: "name" },
  { key: "telefone", label: "Telefone", description: "Número de WhatsApp do contato.", example: "(11) 99999-0000", sourceField: "phone" },
  { key: "email", label: "E-mail", description: "E-mail do contato, quando informado.", example: "mariana@exemplo.com", sourceField: "email" },
  { key: "interesse", label: "Interesse", description: "Objetivo ou conexão de interesse.", example: "Economia na conta de luz", sourceField: "interest" },
  { key: "tipo", label: "Tipo de contato", description: "Classificação atual do contato.", example: "Cliente", sourceField: "kind" },
  { key: "origem", label: "Origem", description: "Local ou campanha de origem do contato.", example: "Mutirão Centro", sourceField: "origin" },
  { key: "status", label: "Status", description: "Etapa atual do contato no acompanhamento.", example: "Novo", sourceField: "status" },
  { key: "observacao", label: "Observação", description: "Observação livre salva no contato.", example: "Prefere contato à tarde", sourceField: "note" },
] as const;

export const exampleMessageContact: MessageContact = {
  name: "Mariana Alves",
  phone: "(11) 99999-0000",
  email: "mariana@exemplo.com",
  interest: "Economia na conta de luz",
  kind: "Cliente",
  origin: "Mutirão Centro",
  status: "Novo",
  note: "Prefere contato à tarde",
};

const variableByKey = new Map(messageVariables.map((variable) => [variable.key, variable]));
const placeholderPattern = /\{\{\s*([^{}\s]+)\s*\}\}/g;

function normalizeRenderedText(value: string) {
  return value
    .split("\n")
    .map((line) => line.replace(/[ \t]{2,}/g, " ").replace(/[ \t]+([,.;!?])/g, "$1").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function renderMessageTemplate(template: string, contact: MessageContact) {
  const unknownVariables = new Set<string>();
  const rendered = template.replace(placeholderPattern, (placeholder, rawKey: string) => {
    const key = rawKey.toLowerCase();
    const variable = variableByKey.get(key);
    if (!variable) {
      unknownVariables.add(rawKey);
      return placeholder;
    }
    const value = variable.resolve ? variable.resolve(contact) : contact[variable.sourceField];
    return String(value ?? "").trim();
  });

  return { text: normalizeRenderedText(rendered), unknownVariables: [...unknownVariables] };
}

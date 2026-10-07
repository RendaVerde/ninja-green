export const sequenceAudiences = ["Todos os contatos", "Somente clientes", "Somente licenciados"] as const;

export type SequenceAudience = (typeof sequenceAudiences)[number];
export type ContactKind = "Cliente" | "Licenciado";

export type AudienceConflict = {
  contactId: string;
  contactName: string;
  sequenceId: string;
  sequenceName: string;
};

export type AudienceAssignmentResult = {
  status: "success" | "conflict";
  conflicts: AudienceConflict[];
  resolvedCount: number;
  assignedCount?: number;
  movedCount?: number;
  removedCount?: number;
};

export function matchesAudience(audience: string, kind: ContactKind) {
  return audience === "Todos os contatos"
    || (audience === "Somente clientes" && kind === "Cliente")
    || (audience === "Somente licenciados" && kind === "Licenciado");
}

import type { SequenceAudience } from "@/lib/audience";

export type LeadStatus = "Novo" | "Em contato" | "Respondeu" | "Qualificado";
export type LeadKind = "Cliente" | "Licenciado";

export type ContactTag = {
  id: string;
  name: string;
  color: string | null;
  contactCount?: number;
};

export type Lead = {
  id: string;
  name: string;
  phone: string;
  email?: string;
  kind: LeadKind;
  interest: string;
  origin: string;
  status: LeadStatus;
  nextContact: string;
  lastContact: string;
  note?: string;
  tagIds?: string[];
  nextRunAt?: string | null;
  lastContactAt?: string | null;
  createdAt?: string;
  history?: { id: string; title: string; detail: string; time: string }[];
};

export type SequenceStep = {
  id: string;
  delayDays: number;
  title: string;
  message: string;
  enabled: boolean;
};

export type FollowUpSequence = {
  id: string;
  name: string;
  audience: SequenceAudience;
  pauseOnReply: boolean;
  active: boolean;
  tagIds: string[];
  contactIds: string[];
  steps: SequenceStep[];
  createdAt?: string;
  updatedAt?: string;
};

export const defaultSequence: SequenceStep[] = [
  { id: "welcome", delayDays: 0, title: "Boas-vindas", message: "Olá, {{nome}}! Tudo bem? Vi que você tem interesse em {{interesse}}. Posso te explicar de forma rápida como funciona?", enabled: true },
  { id: "benefit", delayDays: 3, title: "Benefício principal", message: "Olá, {{nome}}! Separei uma informação que pode ajudar você a avaliar melhor {{interesse}}. Posso te enviar?", enabled: true },
  { id: "proof", delayDays: 7, title: "Caso real", message: "Oi, {{nome}}! Tenho um exemplo real de alguém com um objetivo parecido com o seu. Quer conhecer o resultado?", enabled: true },
  { id: "question", delayDays: 14, title: "Quebra de objeção", message: "Olá, {{nome}}! Ficou alguma dúvida sobre {{interesse}} que eu possa esclarecer para você?", enabled: true },
  { id: "closing", delayDays: 25, title: "Último contato", message: "Oi, {{nome}}! Vou encerrar meus lembretes por aqui, mas continuo à disposição quando quiser conversar sobre {{interesse}}.", enabled: false },
];

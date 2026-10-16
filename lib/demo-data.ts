import type { SequenceAudience } from "@/lib/audience";
import type { MessageAttachment } from "@/lib/message-attachments";

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
  doNotContact?: boolean;
  tagIds?: string[];
  sequenceId?: string | null;
  currentStep?: number | null;
  nextRunAt?: string | null;
  lastContactAt?: string | null;
  createdAt?: string;
  history?: {
    id: string;
    title: string;
    detail: string;
    time: string;
    queueStatus?: "pending" | "sending" | "sent" | "failed" | "unknown" | "canceled" | null;
  }[];
};

export type SequenceStep = {
  id: string;
  delayDays: number;
  title: string;
  message: string;
  attachments: MessageAttachment[];
  enabled: boolean;
  sendTime?: string | null;
};

export type FollowUpSequence = {
  id: string;
  name: string;
  audience: SequenceAudience;
  pauseOnReply: boolean;
  active: boolean;
  connectionId?: string | null;
  priority?: number;
  tagIds: string[];
  contactIds: string[];
  steps: SequenceStep[];
  createdAt?: string;
  updatedAt?: string;
};

export const defaultSequence: SequenceStep[] = [
  { id: "welcome", delayDays: 0, title: "Boas-vindas", message: "Olá, {{nome}}! Tudo bem? Vi que você tem interesse em {{interesse}}. Posso te explicar de forma rápida como funciona?", attachments: [], enabled: true },
  { id: "benefit", delayDays: 3, title: "Benefício principal", message: "Olá, {{nome}}! Separei uma informação que pode ajudar você a avaliar melhor {{interesse}}. Posso te enviar?", attachments: [], enabled: true },
  { id: "proof", delayDays: 7, title: "Caso real", message: "Oi, {{nome}}! Tenho um exemplo real de alguém com um objetivo parecido com o seu. Quer conhecer o resultado?", attachments: [], enabled: true },
  { id: "question", delayDays: 14, title: "Quebra de objeção", message: "Olá, {{nome}}! Ficou alguma dúvida sobre {{interesse}} que eu possa esclarecer para você?", attachments: [], enabled: true },
  { id: "closing", delayDays: 25, title: "Último contato", message: "Oi, {{nome}}! Vou encerrar meus lembretes por aqui, mas continuo à disposição quando quiser conversar sobre {{interesse}}.", attachments: [], enabled: false },
];

export type LeadStatus = "Novo" | "Em contato" | "Respondeu" | "Qualificado";
export type LeadKind = "Cliente" | "Licenciado";

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
};

export const initialLeads: Lead[] = [
  { id: "1", name: "Ana Clara Martins", phone: "(11) 99842-7810", email: "ana@email.com", kind: "Cliente", interest: "Economia na conta de luz", origin: "Mutirão Centro", status: "Em contato", nextContact: "Hoje, 10:30", lastContact: "Há 3 dias" },
  { id: "2", name: "Rafael Souza", phone: "(31) 99114-2098", kind: "Licenciado", interest: "Conhecer o modelo de negócio", origin: "Indicação", status: "Respondeu", nextContact: "Agora", lastContact: "Há 12 min" },
  { id: "3", name: "Mercado Avenida", phone: "(19) 98817-4402", email: "financeiro@mercadoavenida.com", kind: "Cliente", interest: "Conexão empresarial", origin: "Visita comercial", status: "Qualificado", nextContact: "Hoje, 15:00", lastContact: "Ontem" },
  { id: "4", name: "Juliana Costa", phone: "(41) 99651-0377", kind: "Cliente", interest: "Conexão residencial", origin: "Instagram", status: "Novo", nextContact: "Amanhã, 09:00", lastContact: "Ainda não contatada" },
  { id: "5", name: "Marcos Vieira", phone: "(21) 98730-6681", kind: "Licenciado", interest: "Renda complementar", origin: "Evento local", status: "Em contato", nextContact: "02 out, 11:00", lastContact: "Há 5 dias" },
];

export const timelineByLead: Record<string, { title: string; detail: string; time: string }[]> = {
  "1": [
    { title: "Mensagem enviada", detail: "Apresentação e simulação de economia", time: "27 set · 14:20" },
    { title: "Contato cadastrado", detail: "Captado no Mutirão Centro", time: "27 set · 14:18" },
  ],
  "2": [{ title: "Resposta recebida", detail: "Quero entender como funciona a licença", time: "Hoje · 09:48" }],
  "3": [{ title: "Contato qualificado", detail: "Fatura média informada: R$ 4.800", time: "Ontem · 16:12" }],
};

export type SequenceStep = {
  id: string;
  delayDays: number;
  title: string;
  message: string;
  enabled: boolean;
};

export const defaultSequence: SequenceStep[] = [
  { id: "welcome", delayDays: 0, title: "Boas-vindas", message: "Apresentação curta e confirmação do interesse", enabled: true },
  { id: "benefit", delayDays: 3, title: "Benefício principal", message: "Conteúdo alinhado ao objetivo do contato", enabled: true },
  { id: "proof", delayDays: 7, title: "Caso real", message: "Exemplo de resultado de um perfil semelhante", enabled: true },
  { id: "question", delayDays: 14, title: "Quebra de objeção", message: "Pergunta curta para retomar a conversa", enabled: true },
  { id: "closing", delayDays: 25, title: "Último contato", message: "Encerramento cordial com porta aberta", enabled: false },
];

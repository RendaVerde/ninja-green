# Handoff — saída automática (M1)

- Branch: `codex/outbound-automation`; M1 no commit `63a84d3` e documentação de deduplicação no `a149d1d`.
- Fila usa `messages`, claim SQL atômico com lease, `request_started_at`, estados pendente/enviando/enviada/falhou/incerta/cancelada e `externalKey = id`.
- Despachante é server-only, limita lote/conexão, revalida dono/contato/conexão e obtém credencial por `owner_id + connection_id`.
- Mensagens rápidas confirmadas e avulsas enfileiram; `after()` pode solicitar uma execução curta. O endpoint `/api/outbound/dispatch` exige Bearer.
- `pause_all` bloqueia tudo; `automatic_sending_enabled` libera apenas cadências; envio rápido requer confirmação; `do_not_contact` bloqueia a fila.
- Sem conexão ou com automático desligado, cadência mantém follow-up manual e `wa.me` permanece fallback do avulso.
- Conexão inválida com automático ligado falha com motivo; falha definitiva de cadência pausa a inscrição e notifica.
- Prioridade: avulso e dia 0 antes de follow-up no mesmo horário. Anexos continuam apenas no fluxo manual.
- Migração `202610161000_outbound_queue.sql` foi aplicada e a `main` antiga continua inserindo/listando mensagens.
- O teste de compatibilidade via REST inseriu o formato antigo (`status = sending`) com êxito; o REST ignorou `tx=rollback`, então a linha foi removida e confirmada ausente.
- RLS verificado: usuário autenticado não lê mensagens/outbound settings de outro dono; havia mensagens de outro dono no servidor.
- ZPRO: dois pares de chamadas iguais por `externalKey` receberam HTTP 200 e entregaram uma mensagem por par; retenção da chave não foi testada.
- M1 ainda não faz retry automático após resultado incerto. A regra de uma retentativa, `retry_of`, cron, cadências reais e disjuntor BaseUrl são M2.
- Não há credenciais neste arquivo. Não commitá-lo sem solicitação explícita.

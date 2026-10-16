# Plano aprovado — automação de saída

## Objetivo e requisitos

- Uma fila única em `messages`: cada operação tem dono, contato, conexão, texto renderizado, agendamento, tentativas, erro, envio e `externalKey = id`; cadências e envios avulsos apenas enfileiram e o claim é atômico.
- Uma conexão ativa é escolhida automaticamente; com duas ou mais, o usuário escolhe. Cadência guarda sua conexão e envio rápido usa a última escolha como padrão.
- Sem conexão ativa, o envio avulso usa `wa.me` como fallback; cadências permanecem no modo manual de follow-ups pendentes.
- O cadastro inscreve automaticamente o contato elegível em no máximo uma cadência ativa; dia 0 é imediato e as próximas etapas respeitam `delay_days`, pausa, resposta, etapa desabilitada e conclusão.
- Horários usam fuso do usuário (`America/Sao_Paulo` por padrão), horário padrão/sobrescrita por etapa e janela segura editável, inicialmente 08:00–20:00.
- Um endpoint Bearer, independente do gatilho, processa lotes pequenos com limite por conexão e orçamento de execução; segredos ficam somente no servidor.
- Há chave de envio automático desligada por padrão, limite diário por conexão, pausa global, isolamento estrito por dono e campo `não contatar`.
- Histórico mostra agendada/enviada/falha; painel de fila e falhas gera notificações. Webhook ZPRO de resposta/entrega fica somente no plano.

## Ajustes obrigatórios aprovados

1. `request_started_at` é gravado antes do provedor. Testes reais mostraram deduplicação por `externalKey` (prazo de retenção não testado).
2. Timeout, 5xx ou lease expirado: no máximo uma retentativa com a mesma chave/payload, após 60 s e até 15 min; depois, **Envio incerto** manual.
3. Reenvio manual cria nova linha com `retry_of`, nova `externalKey` e aviso de possível entrega da original.
4. Lease excede `maxDuration` com folga; cada rota declara `maxDuration`.
5. Migrações são aditivas e compatíveis com a `main`: colunas nulas/default, constraints `NOT VALID`, backfill/mapeamento legado antes da validação.
6. Sem anexos nesta entrega: uma linha por operação prepara evolução futura; decisão de anexos fica adiada.
7. Sem conexão ou com automático desligado, cadência preserva modo manual; com automático ligado e conexão inválida, falha/notifica.
8. Despachante não bloqueia a requisição do usuário: produtor só solicita execução; nenhum `sleep` de 8–20 s nela.
9. Falha definitiva pausa a inscrição com motivo e notifica; não pula etapa.
10. `pause_all` bloqueia tudo; automático libera apenas cadências; rápido exige confirmação da revisão. `não contatar` bloqueia fila e cadências; avulsos e dia 0 têm prioridade maior.

## Decisões do plano

- Aprovadas: tolerância de passivo de 12 h; limite inicial 30/dia/conexão; lote 3/conexão; intervalo aleatório 8–20 s sem dormir a requisição do usuário; prioridade configurável entre cadências; Supabase Cron + `pg_net` no Hobby; itens enfileirados imutáveis; branch `codex/outbound-automation`.
- Retry de três tentativas foi substituído pela regra única acima. Sem conexão mudou para o fallback/manual. Anexos (uma linha por operação) ficaram adiados.
- Antes do M2, confirmar `pg_cron` e `pg_net`, usar Vault para URL/segredo e validar chamada simulada. Vercel Cron Pro é alternativa futura; Hobby não atende minuto a minuto.

## M2 — cadência, horários, gatilho e salvaguardas

- Materializar etapas vencidas e despachar filas em fases separadas; calcular próxima etapa somente após êxito da anterior, na data local.
- Aplicar horário por usuário/etapa, janela segura, tolerância de atrasos, retenção do passivo antigo e ação explícita de reagendamento.
- Implementar retentativa ambígua, `retry_of`, disjuntor por BaseUrl, limites, jitter agendado e endpoint acionado por cron.
- Pause manual/resposta, etapa desabilitada e `não contatar` cancelam ou impedem pendências conforme a regra; falha definitiva pausa a inscrição.
- Planejar webhook ZPRO para entrega/resposta e `pause_on_reply`, sem implementar até haver contrato oficial.

## M3 — interface e visibilidade

- Tela de configurações: automático, pausar tudo, fuso, horário/janela, atraso, limites, saúde e passivo retido.
- Seletor de conexão em cadência e envio rápido; horário por etapa; indicação explícita de fallback manual.
- Painel de fila/falhas com filtros, tentativas, ações de cancelar/retry e notificações; histórico por contato sem limite global.

## Validação e riscos

- Provedor simulado cobre concorrência, repetição após enviada, isolação entre donos e regras de retry; envio real só ao número autorizado e confirmado.
- Riscos: contrato de webhook, extensão/segredo do cron, alterações de cadência após materialização, janela de deduplicação não conhecida e estado de saúde compartilhado por BaseUrl.

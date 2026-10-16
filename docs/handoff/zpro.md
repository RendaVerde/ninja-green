# Handoff — Integração ZPRO

## 1. Estado
- Branch atual: main, sincronizada com origin/main no momento da verificação.
- Commits da integração: c2573e5, c30ee22, 2c942a0, b261c07, f91652e, 221178b, 9e51ffb, a53af89, 34aa341 e 89f312a.
- Conexão ZPRO privada por usuário e CRUD: feito.
- Teste por ID do canal e mensagens claras de erro: feito.
- Ajuda do ID, alinhamento ApiID/Token e logout mobile: feito.
- Envio real de texto pela ZPRO no follow-up e nas mensagens rápidas (antigo M2): feito, acionado pelo usuário; não é ainda um despachante automático agendado.
- Envio real de mídia por URL nos dois fluxos: feito no código.
- Validação ponta a ponta com envio autorizado e confirmação de recebimento: pendente.
- Webhooks de entrega/resposta e pause_on_reply: pendente.

## 2. Banco
- 202610131000_zpro_connection_secrets.sql: tabela privada de tokens; efeito presente no Supabase configurado em .env.local.
- 202610131700_zpro_message_delivery.sql: metadados de entrega/erro; efeito presente no Supabase configurado em .env.local.
- 202610151200_add_zpro_channel_identity.sql: channel_number legado e channel_id; efeito final presente no Supabase configurado.
- 202610151600_use_zpro_channel_id.sql: consolida channel_id e documenta channel_number como legado; histórico individual de aplicação não verificado.
- Não foi possível classificar o projeto configurado como desenvolvimento ou produção; aplicação em produção: não verificado.
- Há 1 conexão ZPRO com ID do canal no projeto configurado; se ela foi criada exclusivamente pelo teste: não verificado. Nenhum envio real foi feito nestes testes de conexão.

## 3. Decisões e por quê
- Cada usuário mantém sua conexão em whatsapp_connections: BaseUrl, ApiID, token Bearer privado e ID do canal, sob o RLS existente.
- “Testar conexão” usa POST /showChannelById com corpo contendo id porque /showChannel por número falha em canais conectados por QR code.
- O envio usa /v2/api/external/{ApiID}; number identifica o destinatário e externalKey é única para evitar duplicação.
- Foram descartados: número do canal como identidade, /showChannel como teste principal, token no cliente e envio base64/multipart; mídia usa URL assinada.

## 4. Armadilhas
- use-back-closable fechava pela UI e pelo efeito, chamando history.back() várias vezes; agora cada abertura possui uma entrada marcada e o popover pequeno não usa histórico.
- O texto auxiliar do ApiID desalinhava o rótulo do token; a ajuda foi movida para uma linha própria.
- O logout existia só no desktop; “Sair” agora fica no perfil mobile e redireciona com replace.
- A coleção Postman omite corpos obrigatórios; /showChannel pode retornar erro ou vazio em conexão por QR code.
- Ainda frágeis: contrato de webhooks não verificado, ausência de teste automatizado e falta de validação real autorizada dos envios.

## 5. Onde fica cada coisa
- lib/whatsapp/: contrato, fábrica, resolução, configuração e cliente ZPRO.
- components/whatsapp-connections.tsx: cadastro, edição, teste e ajuda; hooks/use-back-closable.ts: histórico dos overlays.
- app/api/whatsapp-connections/: CRUD e teste; app/api/messages/ e app/api/quick-sends/: entradas de envio.
- lib/outbound-messages.ts: reserva, idempotência, envio e histórico; docs/zpro-api.md: contrato validado.

## 6. Próximo passo
- Planejar o envio automático real que substitui o M2 antigo: fila única, despachante, agendador, horários por etapa e escolha explícita da conexão.

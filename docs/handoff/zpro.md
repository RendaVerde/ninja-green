# Handoff — Integração ZPRO

## Estado
- Pedido: integrar ZPRO multi-tenant ao follow-up e às mensagens rápidas, com texto e anexos reais.
- M1: contrato documentado, provedor comum, credenciais privadas e teste de conexão (`81e9e64`, `c2573e5`).
- M2: texto real, fallback manual, histórico, erros e idempotência (`c30ee22`).
- Revisão M1/M2: backend ou endpoint completo, extração do ApiID, etapa correta e prevenção de envio duplo (`2c942a0`).
- M3: imagens, vídeos e PDFs por URL assinada, nos dois fluxos (`b261c07`).
- Integração publicada na `main` pelo merge `f91652e`.
- Falta validar envios reais com uma instância ZPRO e um número de teste autorizado.
- Webhooks de entrega/resposta e acionamento de `pause_on_reply` ainda não foram implementados.

## Decisões
- Cada usuário informa o backend da própria ZPRO; a URL do painel não participa da integração.
- O endpoint completo pode ser colado para extrair o ApiID, reduzindo erro de configuração.
- Backend, ApiID completo e token permanecem no servidor; a interface mostra apenas estado e máscara.
- Texto usa a rota externa principal; mídia usa `/url` com link temporário do Storage.
- Base64 e multipart foram descartados: URL evita processamento extra e atende o contrato conhecido.
- Sem conexão ativa, preserva-se o envio manual por `wa.me`.
- Arquivos são sequenciais e usam chaves determinísticas para reduzir duplicação em retries.

## Armadilhas
- As primeiras alterações foram feitas em um clone porque o HD `F:` estava desconectado; tudo foi reaplicado e validado em `F:\ninja-green`.
- ZPRO possui frontend e backend distintos; usar o frontend torna os endpoints inválidos.
- O ApiID pode estar embutido após `/v2/api/external/`; duplicar esse trecho quebrava a URL.
- O follow-up selecionava sempre a primeira etapa, ignorando `current_step`; isso foi corrigido.
- Uma troca de modo entre prévia e envio podia abrir `wa.me` e também usar ZPRO; o modo manual agora é fixado na requisição.
- Links assinados dentro do corpo podiam exceder o limite; anexos agora viajam separadamente.
- Não há migração nova neste conjunto; ele depende das migrações ZPRO e Storage já existentes no projeto.

## Arquivos-chave
- `docs/zpro-api.md`: contrato conhecido da API ZPRO.
- `lib/whatsapp/`: interface, fábrica, resolução, configuração e implementação ZPRO.
- `lib/outbound-messages.ts`: reserva, retry, envio, fallback e histórico.
- `app/api/whatsapp-connections/`: CRUD, atendentes e teste da conexão.
- `app/api/messages/` e `app/api/quick-sends/`: entradas de follow-up e mensagens rápidas.
- `lib/message-attachment-links.ts`: geração e validação de URLs assinadas.

## Próximo passo exato
- Com autorização e número de teste, enviar texto, imagem, vídeo e PDF pelos dois fluxos; conferir recebimento, status e histórico antes de iniciar os webhooks.

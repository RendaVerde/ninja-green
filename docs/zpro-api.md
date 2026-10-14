# ZPRO API — contrato usado pelo Ninja Green

Fonte: coleção pública **Z-PRO v4.x.x.x** no Postman, consultada em 13/10/2026. Este resumo cobre somente autenticação, envio, teste de canal e eventos necessários ao app.

## Base e autenticação

- Base informada pelo cliente: `https://{BaseUrl}`.
- Identificador da API: `{ApiID}` na URL.
- Header em todas as rotas abaixo: `Authorization: Bearer {token}`.
- Credenciais devem permanecer no servidor. Nunca expor token em resposta, log ou variável `NEXT_PUBLIC_*`.

## Enviar texto

`POST https://{BaseUrl}/v2/api/external/{ApiID}` com JSON:

- `body`: texto final da mensagem.
- `number`: WhatsApp com DDI, somente dígitos, por exemplo `5511999999999`.
- `externalKey`: chave única criada pelo sistema cliente; não pode se repetir.
- `isClosed`: fecha o ticket depois do envio (`false` no Ninja Green).
- `validateNumber`: opcional, padrão `true`; `false` mantém o número exatamente como enviado e é recomendado pela documentação apenas para WABA em casos de duplicação pelo nono dígito.

A resposta de sucesso inclui o `ticketId` efetivo e `idFront`, usados para correlação. Erros seguem o formato `{ "success": false, "error": "ERR_*" }`.

## Enviar arquivo/mídia — próxima etapa

As rotas usam o mesmo Bearer token e os mesmos campos `body`, `number`, `externalKey`, `isClosed` e `validateNumber`:

- Multipart: `POST /v2/api/external/{ApiID}` com `multipart/form-data`; campo `media` do tipo arquivo. A coleção descreve imagens, documentos etc., sem publicar uma allow-list de MIME ou limite específico do multipart.
- Por URL: `POST /v2/api/external/{ApiID}/url` com JSON e `mediaUrl` apontando para o arquivo, além dos campos comuns.
- A coleção também documenta envio em JSON/base64 e informa teto de **50 MB para o body JSON**. Não implementar até validar o payload completo.

## Testar conexão/status

`POST https://{BaseUrl}/v2/api/external/{ApiID}/showChannel`, com Bearer token e sem body documentado. Usar como teste de credenciais/canal; tratar HTTP não-2xx, JSON inválido ou `success: false` como falha. O formato detalhado da resposta não está descrito na coleção.

Para consultar uma mensagem: `GET /v2/api/external/{ApiID}/getMessageByMessageId?messageId={wamid}`, também com Bearer token.

## Webhooks, erros e limites

A coleção menciona webhooks e correlação por `externalKey`, `ticketId` e `idFront`, mas **não expõe contrato de configuração nem payloads de entrega/resposta**. Não implementar webhook sem documentação adicional ou export da coleção. Para todos os requests: aplicar timeout, não registrar credenciais, preservar o código `ERR_*` no histórico técnico e mostrar mensagem segura ao usuário. A coleção declara não haver rate limit; mesmo assim, o Ninja Green deve manter intervalo configurável em lotes e idempotência por `externalKey`.

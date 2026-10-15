# ZPRO API — contrato usado pelo Ninja Green

Fonte: coleção pública **Z-PRO v4.x.x.x** no Postman, consultada em 13/10/2026. Este resumo cobre somente autenticação, envio, teste de canal e eventos necessários ao app.

## Base e autenticação

- Cada cliente informa o backend público da própria instalação: `https://{BaseUrl}`. A URL do painel/frontend não é usada pelo Ninja Green.
- Identificador da API: `{ApiID}` na URL.
- Header em todas as rotas abaixo: `Authorization: Bearer {token}`.
- Backend, ApiID e token são configurações privadas de cada tenant. Nunca usar uma instalação real como padrão ou exemplo, nem expor esses valores em logs ou variáveis `NEXT_PUBLIC_*`.
- A tela aceita tanto a base isolada quanto o endpoint completo `/v2/api/external/{ApiID}`; quando completo, o app separa e armazena base e ApiID.

## Enviar texto

`POST https://{BaseUrl}/v2/api/external/{ApiID}` com JSON:

- `body`: texto final da mensagem.
- `number`: WhatsApp com DDI, somente dígitos, por exemplo `5511999999999`.
- `externalKey`: chave única criada pelo sistema cliente; não pode se repetir.
- `isClosed`: fecha o ticket depois do envio (`false` no Ninja Green).
- `validateNumber`: opcional, padrão `true`; `false` mantém o número exatamente como enviado e é recomendado pela documentação apenas para WABA em casos de duplicação pelo nono dígito.

A resposta de sucesso inclui o `ticketId` efetivo e `idFront`, usados para correlação. Erros seguem o formato `{ "success": false, "error": "ERR_*" }`.

## Enviar arquivo/mídia

As rotas usam o mesmo Bearer token e os mesmos campos `body`, `number`, `externalKey`, `isClosed` e `validateNumber`:

- Multipart: `POST /v2/api/external/{ApiID}` com `multipart/form-data`; campo `media` do tipo arquivo. A coleção descreve imagens, documentos etc., sem publicar uma allow-list de MIME ou limite específico do multipart.
- Por URL: `POST /v2/api/external/{ApiID}/url` com JSON e `mediaUrl` apontando para o arquivo, além dos campos comuns.
- A coleção também documenta envio em JSON/base64 e informa teto de **50 MB para o body JSON**. Não implementar até validar o payload completo.

O Ninja Green usa a rota por URL com links temporários assinados do Supabase Storage. Cada arquivo recebe uma `externalKey` determinística no formato `{messageId}-media-{posição}`; não usamos base64 nem multipart nesta implementação.

## Testar conexão/status

> **Correção do contrato:** a coleção pública do Postman omite os corpos obrigatórios destas rotas. O comportamento validado diretamente com a API da ZPRO é a fonte de verdade usada pelo Ninja Green.

- `POST https://{BaseUrl}/v2/api/external/{ApiID}/showChannelById`, com Bearer token, `Content-Type: application/json` e body `{ "id": 21 }`, onde `id` é o identificador inteiro e positivo exibido com `#` ao lado do nome da conexão no painel da ZPRO.
- `POST https://{BaseUrl}/v2/api/external/{ApiID}/showChannel`, com body `{ "number": "5511999999999" }`, existe, mas a consulta por número é pouco confiável: em conexões feitas por QR code, o número não é associado ao canal como acontece na vinculação manual e a rota pode responder que o canal não foi encontrado.

O Ninja Green usa somente `/showChannelById` para o teste de leitura. O ID do canal é a identidade persistida da conexão; o campo `number` da rota de envio continua sendo exclusivamente o número do destinatário. Conexões antigas continuam válidas, mas precisam receber o ID antes do primeiro teste. Tratar 401/403 como credencial inválida, 404 ou resposta vazia como canal não encontrado, 5xx como erro da ZPRO e falha de rede/URL como BaseUrl incorreta.

Para consultar uma mensagem: `GET /v2/api/external/{ApiID}/getMessageByMessageId?messageId={wamid}`, também com Bearer token.

## Webhooks, erros e limites

A coleção menciona webhooks e correlação por `externalKey`, `ticketId` e `idFront`, mas **não expõe contrato de configuração nem payloads de entrega/resposta**. Não implementar webhook sem documentação adicional ou export da coleção. Para todos os requests: aplicar timeout, não registrar credenciais, preservar o código `ERR_*` no histórico técnico e mostrar mensagem segura ao usuário. A coleção declara não haver rate limit; mesmo assim, o Ninja Green deve manter intervalo configurável em lotes e idempotência por `externalKey`.

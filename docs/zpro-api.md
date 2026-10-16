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
- `externalKey`: chave da operação criada pelo sistema cliente. No M1 é o UUID da linha em `messages`. Dois testes reais confirmaram deduplicação para chamadas repetidas com a mesma chave e o mesmo payload; o prazo de retenção da chave não foi testado.
- `isClosed`: fecha o ticket depois do envio (`false` no Ninja Green).
- `validateNumber`: opcional, padrão `true`; `false` mantém o número exatamente como enviado e é recomendado pela documentação apenas para WABA em casos de duplicação pelo nono dígito.

A resposta de sucesso inclui o `ticketId` efetivo e `idFront`, usados para correlação. Erros seguem o formato `{ "success": false, "error": "ERR_*" }`.

## Enviar arquivo/mídia

As rotas usam o mesmo Bearer token e os mesmos campos `body`, `number`, `externalKey`, `isClosed` e `validateNumber`:

- Multipart: `POST /v2/api/external/{ApiID}` com `multipart/form-data`; campo `media` do tipo arquivo. A coleção descreve imagens, documentos etc., sem publicar uma allow-list de MIME ou limite específico do multipart.
- Por URL: `POST /v2/api/external/{ApiID}/url` com JSON e `mediaUrl` apontando para o arquivo, além dos campos comuns.
- A coleção também documenta envio em JSON/base64 e informa teto de **50 MB para o body JSON**. Não implementar até validar o payload completo.

No M1, a fila envia apenas texto. Mensagens com anexos continuam no fluxo manual por `wa.me`. A fila mantém uma linha por operação para permitir mídia em uma entrega futura.

## Resultado incerto e teste de chave repetida

Em 16/10/2026, às 10:07 (America/Sao_Paulo), o proprietário confirmou o teste para o número terminado em **7376**. A primeira chamada, com `externalKey` `8797f410-3bdd-40b0-8d15-aaa9a5c8da57`, retornou HTTP **502**, erro `backend_offline`, sem `idFront`/`messageId` nem `ticketId`. A segunda chamada foi interrompida por segurança porque a primeira não confirmou aceitação.

Em seguida, dois pares de chamadas reais, cada par com o mesmo payload e a mesma `externalKey`, foram feitos para esse número. As chaves foram `97b8ff4c-ce1f-4155-8002-848153e78a0f` e `d5ace5e8-874c-4163-8b19-f71e0f1e62b5`. **Todas as quatro respostas foram HTTP 200, `success: true`, sem identificador de mensagem ou ticket; o proprietário confirmou uma mensagem recebida por par, duas no total.** Nesse cenário, a ZPRO deduplicou por `externalKey` e respondeu da mesma forma à primeira e à segunda chamada. Não foi testado por quanto tempo a ZPRO retém a chave, nem o comportamento de uma repetição após timeout ou erro 5xx.

A regra planejada de retry para resultados ambíguos está em `docs/outbound-plan.md`. Até sua implementação, o M1 mantém esses resultados como **Envio incerto**, sem retry automático. Falhas 4xx que demonstram rejeição anterior ao envio ficam como falhas definitivas.

## Testar conexão/status

> **Correção do contrato:** a coleção pública do Postman omite os corpos obrigatórios destas rotas. O comportamento validado diretamente com a API da ZPRO é a fonte de verdade usada pelo Ninja Green.

- `POST https://{BaseUrl}/v2/api/external/{ApiID}/showChannelById`, com Bearer token, `Content-Type: application/json` e body `{ "id": 21 }`, onde `id` é o identificador inteiro e positivo exibido com `#` ao lado do nome da conexão no painel da ZPRO.
- `POST https://{BaseUrl}/v2/api/external/{ApiID}/showChannel`, com body `{ "number": "5511999999999" }`, existe, mas a consulta por número é pouco confiável: em conexões feitas por QR code, o número não é associado ao canal como acontece na vinculação manual e a rota pode responder que o canal não foi encontrado.

O Ninja Green usa somente `/showChannelById` para o teste de leitura. O ID do canal é a identidade persistida da conexão; o campo `number` da rota de envio continua sendo exclusivamente o número do destinatário. Conexões antigas continuam válidas, mas precisam receber o ID antes do primeiro teste. Tratar 401/403 como credencial inválida, 404 ou resposta vazia como canal não encontrado, 5xx como erro da ZPRO e falha de rede/URL como BaseUrl incorreta.

Para consultar uma mensagem: `GET /v2/api/external/{ApiID}/getMessageByMessageId?messageId={wamid}`, também com Bearer token.

## Webhooks, erros e limites

A coleção menciona webhooks e correlação por `externalKey`, `ticketId` e `idFront`, mas **não expõe contrato de configuração nem payloads de entrega/resposta**. Não implementar webhook sem documentação adicional ou export da coleção. Para todos os requests: aplicar timeout, não registrar credenciais, preservar o código `ERR_*` no histórico técnico e mostrar mensagem segura ao usuário. A coleção declara não haver rate limit; o Ninja Green limita o lote e os envios diários por conexão. O intervalo entre envios fica para o agendador do M2.

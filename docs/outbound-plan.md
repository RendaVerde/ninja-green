# Plano de saída — pendências após o M1

O M1 mantém timeout, erro 5xx, resposta inválida e lease expirado depois de `request_started_at` como **Envio incerto**, sem retentativa automática. As regras abaixo são para o M2; não descrevem comportamento já implementado.

## Retentativa de resultado ambíguo (M2)

- Para timeout, erro 5xx ou lease expirado após o início da chamada, permitir **no máximo uma** retentativa automática da mesma operação, com a **mesma `externalKey` e o mesmo payload**. Não criar uma nova linha de mensagem para essa retentativa.
- Agendar a retentativa pelo menos **60 segundos** após a primeira tentativa e executá-la **dentro de 15 minutos** do início da primeira tentativa. Se a janela terminar antes da execução, não retentar.
- Se a retentativa também não confirmar o envio, ou não puder ocorrer nessa janela, encerrar a automação com status **Envio incerto**, notificação e decisão manual. Nunca entrar em loop de retry nem reenviar uma mensagem já confirmada como enviada.
- O teste com o número terminado em 7376 observou uma entrega para cada par de chamadas com a mesma chave, mas **não testou o prazo de retenção da `externalKey`**. Por isso a janela de 15 minutos é um limite operacional proposto, não uma garantia documentada pela ZPRO.

## Reenvio manual de envio incerto (M2)

- A ação de reenviar deve avisar claramente que a mensagem original **pode já ter sido entregue** e exigir confirmação do usuário.
- Após confirmação, criar **nova linha** vinculada à original por `retry_of`, com **nova `externalKey`** igual ao ID da nova linha. Preservar o registro e o status da tentativa original para auditoria.

## Disjuntor por BaseUrl (M2)

- Manter um disjuntor por **BaseUrl** como requisito do M2: erros repetidos de rede, timeout ou 5xx suspendem temporariamente novas chamadas àquela BaseUrl e notificam os usuários afetados. O despachante não deve transformar essa suspensão em tentativas rápidas em loop.
- Definir e testar limiares, duração da suspensão e retomada controlada antes de habilitar o M2. O disjuntor não altera a regra de uma única retentativa nem autoriza envios fora da janela de 15 minutos.

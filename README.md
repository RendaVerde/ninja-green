# Ninja Green

Aplicação mobile-first para cadastrar oportunidades e organizar follow-ups comerciais pelo WhatsApp.

## Rodar localmente

```bash
npm install
npm run dev
```

Abra `http://localhost:3000`. Com as variáveis preenchidas, a tela de login protege o painel e todos os dados ficam vinculados ao usuário autenticado.

## Login e administração

- Cada usuário entra com e-mail e senha e recebe uma sessão individual.
- O cadastro público fica desabilitado.
- Administradores acessam `/admin` no computador para convidar usuários comuns ou outros administradores.
- No celular, a área administrativa mostra apenas um aviso e não adiciona controles à navegação do PWA.
- Os convites são enviados no servidor com `SUPABASE_SERVICE_ROLE_KEY`; essa chave nunca é enviada ao navegador.
- Cada convidado confirma o e-mail e cria a própria senha em `/auth/invite`.

Para ativar:

1. Crie um projeto no Supabase.
2. Execute [`supabase/schema.sql`](supabase/schema.sql) no SQL Editor.
3. Copie `.env.example` para `.env.local` e preencha as chaves.
4. Defina `ADMIN_EMAILS` com um ou mais e-mails separados por vírgula.
5. Crie o primeiro usuário no painel Authentication do Supabase; depois os demais podem ser criados em `/admin`.
6. Em Authentication > URL Configuration, autorize `http://localhost:3000/**` no desenvolvimento e a URL da Vercel em produção.

## Princípio modular

Nada importante deve depender de valores fixos. A cadência já permite:

- definir livremente os dias de cada follow-up;
- editar o objetivo e a orientação de cada mensagem;
- adicionar, duplicar, remover, ativar e reordenar etapas;
- escolher o público da sequência;
- decidir se a automação para quando o contato responde.

A configuração fica salva no Supabase e vinculada à conta. O schema separa usuários, contatos, sequências, etapas, vínculos e mensagens para permitir vários modelos por usuário, campanha e tipo de contato.

## Vercel

O projeto usa Next.js e está preparado para importação direta do repositório GitHub pela Vercel. Cadastre no painel da Vercel as mesmas variáveis listadas em `env/production.env.example`; não faça upload de um arquivo com chaves reais.

## Operação atual

- Contatos, cadência, etapas, status e histórico usam dados reais do Supabase.
- O sino mostra follow-ups vencidos, respostas marcadas e primeiros contatos pendentes.
- O envio manual abre o WhatsApp com a mensagem preenchida, registra a atividade e avança a cadência.
- Para envio automático em segundo plano, ainda é necessário configurar `UAZAPI_BASE_URL` e `UAZAPI_INSTANCE_TOKEN`, implementar o job agendado e testar uma instância autorizada.

As credenciais do WhatsApp nunca devem ser expostas no navegador ou no aplicativo instalado.

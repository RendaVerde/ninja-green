# Ninja Green

MVP mobile-first para cadastrar oportunidades e organizar follow-ups comerciais pelo WhatsApp.

## Rodar localmente

```bash
npm install
npm run dev
```

Abra `http://localhost:3000`. Sem as variáveis do Supabase, o painel continua disponível em modo local para desenvolvimento. Com as variáveis preenchidas, a tela de login passa a proteger automaticamente o painel.

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

Enquanto o Supabase não está conectado, essa configuração fica salva apenas no dispositivo usado. O schema já separa usuários, contatos, sequências, etapas, vínculos e mensagens para permitir vários modelos por usuário, campanha e tipo de contato.

## Vercel

O projeto usa Next.js e está preparado para importação direta do repositório GitHub pela Vercel. Cadastre no painel da Vercel as mesmas variáveis listadas em `env/production.env.example`; não faça upload de um arquivo com chaves reais.

## Próxima etapa

1. Criar o projeto no Supabase e aplicar o schema preparado.
2. Preencher as variáveis locais e da Vercel.
3. Migrar os dados de demonstração para as tabelas por usuário.
4. Configurar a instância da UazAPI no servidor.
5. Testar o primeiro envio com um número autorizado antes de liberar automações.

As credenciais do WhatsApp nunca devem ser expostas no navegador ou no aplicativo instalado.

# Ninja Green

MVP mobile-first para cadastrar oportunidades e organizar follow-ups comerciais pelo WhatsApp.

## Rodar localmente

```bash
npm install
npm run dev
```

Abra o endereço exibido no terminal. A versão atual funciona em modo de demonstração: cadastro, busca, filtros, detalhes do contato e cadência já estão operacionais.

## Princípio modular

Nada importante deve depender de valores fixos. A cadência já permite:

- definir livremente os dias de cada follow-up;
- editar o objetivo e a orientação de cada mensagem;
- adicionar, duplicar, remover, ativar e reordenar etapas;
- escolher o público da sequência;
- decidir se a automação para quando o contato responde.

Enquanto o Supabase não está conectado, essa configuração fica salva apenas no dispositivo usado. O backend definitivo armazenará sequências e etapas como registros independentes, permitindo vários modelos por usuário, campanha e tipo de contato.

## Próxima etapa

1. Criar o projeto no Supabase e aplicar o schema de contatos, sequências, etapas, mensagens e tarefas.
2. Copiar `.env.example` para `.env.local` e preencher as credenciais.
3. Configurar a instância da UazAPI no servidor.
4. Testar o primeiro envio com um número autorizado antes de liberar automações.

As credenciais do WhatsApp nunca devem ser expostas no navegador ou no aplicativo instalado.

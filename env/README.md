# Variáveis de ambiente

Esta pasta guarda apenas modelos de configuração. Nunca salve chaves reais no Git.

- Desenvolvimento local: copie `development.env.example` para `.env.local` na raiz.
- Vercel: cadastre as mesmas variáveis em **Project Settings → Environment Variables**.
- Produção: use valores diferentes dos ambientes de teste sempre que o serviço permitir.

Variáveis sem o prefixo `NEXT_PUBLIC_` ficam disponíveis somente no servidor. A chave `SUPABASE_SERVICE_ROLE_KEY` e os tokens do WhatsApp jamais podem usar o prefixo público.

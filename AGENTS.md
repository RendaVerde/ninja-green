# Repository Guidelines

## Project Structure & Module Organization

Ninja Green is a mobile-first Next.js 16 application using the App Router and Supabase. Pages and route handlers live in `app/`; API endpoints follow `app/api/<resource>/route.ts`. Product components belong in `components/`, while reusable shadcn primitives are kept in `components/ui/`. Shared authentication, Supabase clients, validation, and utilities live in `lib/`; reusable hooks live in `hooks/`. Database definitions are in `supabase/schema.sql`, incremental production changes in `supabase/migrations/`, and Drizzle definitions in `db/`. Static PWA assets are stored in `public/`. Environment templates live in `.env.example` and `env/`; never commit real credentials.

## Build, Test, and Development Commands

- `npm install`: install dependencies (Node.js 22.13 or newer).
- `npm run dev`: start the local app at `http://localhost:3000`.
- `npm run lint`: run ESLint with Next.js Core Web Vitals and TypeScript rules.
- `npm run build`: create the production build and run framework/type checks.
- `npm start`: serve an existing production build.
- `npm run db:generate`: generate Drizzle migrations after schema changes.

Before opening a pull request, run `npm run lint` and `npm run build`.

## Coding Style & Naming Conventions

Use TypeScript with strict typing, two-space indentation, semicolons, and double quotes. Prefer the `@/` alias over deep relative imports. Name React components in PascalCase, hooks as `use-*.ts`, general modules in kebab-case, and API handlers `route.ts`. Keep server secrets and privileged Supabase operations in server-only modules. Preserve the vendored style of `components/ui/`; add product-specific behavior in higher-level components.

## Testing Guidelines

No automated test framework or coverage threshold is configured yet. Treat lint and production build as required checks. Manually verify authentication, responsive/PWA behavior, tenant isolation, and affected API routes. When adding a test framework, colocate tests as `*.test.ts` or `*.test.tsx` and add the command to `package.json`.

## Commit & Pull Request Guidelines

Follow the existing Conventional Commit pattern: `feat: add sequence editor`, `fix: prevent duplicate follow-up`. Keep commits focused. Pull requests should explain the user-visible change, list validation performed, link relevant issues, include screenshots for UI changes, and identify any new environment variables or Supabase migrations.

## Security & Database Changes

Never expose `SUPABASE_SERVICE_ROLE_KEY` or WhatsApp tokens through `NEXT_PUBLIC_*`. Every tenant-owned table must enforce Row Level Security. Commit idempotent SQL migrations alongside schema updates and document any required Vercel configuration.

## Project Rules

- Every new table has `user_id` and RLS; every query is scoped to the authenticated user. Nothing one user configures may be visible to another.
- No hardcoded values for anything the user should be able to configure.
- Database workflow: `supabase/schema.sql` is the source of truth for the final state. For every DB change, update it AND add an idempotent, additive, backward-compatible migration in `supabase/migrations/` named `YYYYMMDDHHMM_description.sql`. Never touch `db/` (empty, not the production schema). Never apply SQL yourself.
- UI text in Portuguese (pt-BR); mobile-first.
- No new dependencies and no new test framework unless necessary; state why.
- Run `npm run lint` and `npm run build` before finishing any task.
- Final reply: changed files (one line each) + how to test. Do not paste code in the chat.
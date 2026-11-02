-- Tentativas de login erradas (para bloquear quem tenta adivinhar a senha).
-- Guarda só um resumo (hash) do IP.
create table if not exists public.login_tentativas (
  id        bigint generated always as identity primary key,
  ip        text not null,
  criado_em timestamptz not null default now()
);
create index if not exists login_tentativas_criado_em_idx on public.login_tentativas (criado_em);
create index if not exists login_tentativas_ip_idx on public.login_tentativas (ip, criado_em);
alter table public.login_tentativas enable row level security;

-- Defesa em camadas: além do RLS sem políticas, os papéis públicos da API
-- (anon e authenticated) não têm permissão nenhuma nas tabelas do Concord.
revoke all on public.videos, public.em_alta, public.login_tentativas from anon, authenticated;

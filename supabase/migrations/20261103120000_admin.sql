-- Conta de administrador: uma única linha (id = 1). Não existe cadastro;
-- o próprio banco impede uma segunda conta.
create table if not exists public.admin_conta (
  id            smallint primary key default 1 check (id = 1),
  email         text not null,
  senha_hash    text not null,          -- scrypt:<sal>:<hash>
  sessao_versao integer not null default 1, -- muda ao trocar a senha ou encerrar sessões
  atualizado_em timestamptz not null default now()
);

-- Histórico de acessos ao painel. Sem IP: só quando, se deu certo e o tipo de aparelho.
create table if not exists public.acessos (
  id          bigint generated always as identity primary key,
  criado_em   timestamptz not null default now(),
  sucesso     boolean not null,
  dispositivo text
);
create index if not exists acessos_criado_em_idx on public.acessos (criado_em desc);

alter table public.admin_conta enable row level security;
alter table public.acessos enable row level security;
revoke all on public.admin_conta, public.acessos from anon, authenticated;

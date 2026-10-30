-- Ranking de produtos em alta da última busca do robô (aba "Em alta").
create table if not exists public.em_alta (
  item_id       text primary key,
  posicao       integer not null,
  nome          text not null,
  preco         numeric(10,2) not null,
  desconto      numeric(5,2) default 0,
  vendas        integer default 0,
  nota          numeric(3,2) default 0,
  comissao      numeric(6,4) default 0,
  imagem_url    text,
  link_afiliado text not null,
  tema          text,
  pontuacao     numeric(8,2),
  ja_usado      boolean not null default false,
  atualizado_em timestamptz not null default now()
);

create index if not exists em_alta_posicao_idx on public.em_alta (posicao);

-- Só o servidor (service role) acessa.
alter table public.em_alta enable row level security;

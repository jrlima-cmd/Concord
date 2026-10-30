-- Fila de vídeos gerados pelo robô.
create table if not exists public.videos (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  item_id       text not null,
  nome_produto  text not null,
  titulo        text not null,
  preco         numeric(10,2) not null,
  desconto      numeric(5,2) default 0,
  vendas        integer default 0,
  nota          numeric(3,2) default 0,
  comissao      numeric(6,4) default 0,
  imagem_url    text,
  link_afiliado text not null,
  roteiro       text not null,
  legenda       text not null,
  video_path    text not null,
  duracao       numeric(6,2),
  -- pendente -> postado  (ou descartado)
  status        text not null default 'pendente'
                check (status in ('pendente', 'postado', 'descartado')),
  postado_em    timestamptz
);

create index if not exists videos_created_at_idx on public.videos (created_at desc);
create index if not exists videos_item_id_idx on public.videos (item_id);

-- Só o servidor (service role) acessa; nada é exposto publicamente.
alter table public.videos enable row level security;

-- Bucket privado para os arquivos .mp4
insert into storage.buckets (id, name, public)
values ('videos', 'videos', false)
on conflict (id) do nothing;

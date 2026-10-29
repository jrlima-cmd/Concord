-- Cada pedido pertence a um usuário do Supabase Auth
alter table public.orders add column user_id uuid references auth.users(id) on delete set null;
create index orders_user_id_idx on public.orders(user_id, created_at desc);

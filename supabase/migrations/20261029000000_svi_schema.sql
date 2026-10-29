create extension if not exists pgcrypto with schema extensions;

create table public.orders (
    id                text primary key,
    access_token      text not null,
    stripe_session_id text unique,
    holder_name       text not null,
    customer_email    text,
    quantity          integer not null check (quantity > 0),
    unit_amount       integer not null,
    amount_total      integer not null,
    currency          text not null,
    status            text not null default 'PENDING' check (status in ('PENDING', 'PAID', 'EXPIRED', 'FAILED')),
    payment_intent    text,
    created_at        timestamptz not null default now(),
    paid_at           timestamptz
);

create table public.tickets (
    id          bigint generated always as identity primary key,
    code        text not null unique,
    order_id    text not null references public.orders(id),
    number      integer not null,
    holder_name text not null,
    status      text not null default 'VALID' check (status in ('VALID', 'USED')),
    created_at  timestamptz not null default now(),
    used_at     timestamptz
);
create index tickets_order_id_idx on public.tickets(order_id);

create table public.staff_login_failures (
    id  bigint generated always as identity primary key,
    ip  text not null,
    at  timestamptz not null default now()
);
create index staff_login_failures_ip_at_idx on public.staff_login_failures(ip, at);

-- Acesso somente pela Edge Function (service role); nada exposto ao público
alter table public.orders enable row level security;
alter table public.tickets enable row level security;
alter table public.staff_login_failures enable row level security;
revoke all on public.orders, public.tickets, public.staff_login_failures from anon, authenticated;

-- Código sem caracteres ambíguos (0/O, 1/I/L)
create or replace function public.gen_ticket_code()
returns text
language plpgsql
set search_path = ''
as $$
declare
    alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    bytes bytea := extensions.gen_random_bytes(10);
    result text := 'TK-';
begin
    for i in 0..9 loop
        result := result || substr(alphabet, (get_byte(bytes, i) % 31) + 1, 1);
    end loop;
    return result;
end;
$$;

-- Marca o pedido como pago e emite os ingressos (idempotente)
create or replace function public.fulfill_order(p_order_id text, p_email text, p_payment_intent text)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
    o public.orders;
begin
    update public.orders
    set status = 'PAID', paid_at = now(),
        customer_email = coalesce(p_email, customer_email),
        payment_intent = coalesce(p_payment_intent, payment_intent)
    where id = p_order_id and status <> 'PAID'
    returning * into o;

    if not found then
        return false;
    end if;

    insert into public.tickets (code, order_id, number, holder_name)
    select public.gen_ticket_code(), o.id, n, o.holder_name
    from generate_series(1, o.quantity) as n;

    return true;
end;
$$;

-- Validação atômica na portaria: cada ingresso entra uma única vez
create or replace function public.redeem_ticket(p_code text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    t public.tickets;
begin
    update public.tickets set status = 'USED', used_at = now()
    where code = p_code and status = 'VALID'
    returning * into t;

    if found then
        return jsonb_build_object('result', 'OK', 'ticket', to_jsonb(t));
    end if;

    select * into t from public.tickets where code = p_code;
    if found then
        return jsonb_build_object('result', 'ALREADY_USED', 'ticket', to_jsonb(t));
    end if;
    return jsonb_build_object('result', 'NOT_FOUND');
end;
$$;

create or replace function public.ticket_stats()
returns jsonb
language sql
set search_path = ''
as $$
    select jsonb_build_object(
        'total', count(*),
        'used', count(*) filter (where status = 'USED')
    ) from public.tickets;
$$;

revoke execute on function public.gen_ticket_code(), public.fulfill_order(text, text, text),
    public.redeem_ticket(text), public.ticket_stats() from public, anon, authenticated;
grant execute on function public.gen_ticket_code(), public.fulfill_order(text, text, text),
    public.redeem_ticket(text), public.ticket_stats() to service_role;

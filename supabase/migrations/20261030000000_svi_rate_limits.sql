-- Limite de tentativas da portaria: contagem e registro numa única operação, serializada por IP,
-- para que tentativas disparadas ao mesmo tempo também sejam contadas.
create or replace function public.staff_login_attempt(p_ip text, p_max integer, p_window_minutes integer)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
    recent integer;
begin
    perform pg_advisory_xact_lock(hashtext('svi_staff_login:' || p_ip));

    delete from public.staff_login_failures
    where ip = p_ip and at <= now() - make_interval(mins => p_window_minutes);

    select count(*) into recent from public.staff_login_failures where ip = p_ip;
    if recent >= p_max then
        return false;
    end if;

    -- A tentativa conta antes de a senha ser conferida; um login correto apaga o registro
    insert into public.staff_login_failures (ip) values (p_ip);
    return true;
end;
$$;

-- Cria o pedido só se o usuário não tiver pedidos pendentes demais (serializado por usuário)
create or replace function public.create_order_limited(
    p_id text, p_user_id uuid, p_access_token text, p_holder_name text, p_quantity integer,
    p_unit_amount integer, p_currency text, p_max_pending integer, p_window_minutes integer
)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
    pending integer;
begin
    perform pg_advisory_xact_lock(hashtext('svi_orders:' || p_user_id::text));

    select count(*) into pending from public.orders
    where user_id = p_user_id and status = 'PENDING'
      and created_at > now() - make_interval(mins => p_window_minutes);
    if pending >= p_max_pending then
        return false;
    end if;

    insert into public.orders (id, user_id, access_token, holder_name, quantity, unit_amount, amount_total, currency)
    values (p_id, p_user_id, p_access_token, p_holder_name, p_quantity, p_unit_amount, p_unit_amount * p_quantity, p_currency);
    return true;
end;
$$;

revoke execute on function public.staff_login_attempt(text, integer, integer),
    public.create_order_limited(text, uuid, text, text, integer, integer, text, integer, integer)
    from public, anon, authenticated;
grant execute on function public.staff_login_attempt(text, integer, integer),
    public.create_order_limited(text, uuid, text, text, integer, integer, text, integer, integer)
    to service_role;

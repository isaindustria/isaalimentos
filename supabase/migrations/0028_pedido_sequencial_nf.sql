-- Solicitação #19 (Rotas de entrega 4)
-- 1) O número do pedido lançado no sistema é gerado pelo próprio sistema, em ordem sequencial de criação,
--    independente do usuário, e não pode ser digitado nem trocado depois.
--    Pedidos importados de PDF (source = 'pdf') mantêm o número do documento de origem.
-- 2) Número da NF de cada pedido, digitado no romaneio.

alter table public.orders add column if not exists nf_number text;

create sequence if not exists public.orders_number_seq;

-- numera, pela ordem de criação, os pedidos do sistema que ainda não têm número
with semnum as (
  select id, row_number() over (order by created_at, id) as n
  from public.orders where order_number is null and source <> 'pdf'
)
update public.orders o set order_number = s.n::text from semnum s where o.id = s.id;

select setval('public.orders_number_seq',
  greatest(1, coalesce((select max(order_number::bigint) from public.orders where source <> 'pdf' and order_number ~ '^\d+$'), 0)),
  coalesce((select max(order_number::bigint) from public.orders where source <> 'pdf' and order_number ~ '^\d+$'), 0) > 0);

create or replace function public.orders_numero_sequencial() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if coalesce(new.source, 'manual') <> 'pdf' then
      new.order_number := nextval('public.orders_number_seq')::text;
    end if;
  elsif new.order_number is distinct from old.order_number and old.order_number is not null then
    raise exception 'O número do pedido é gerado pelo sistema e não pode ser alterado.';
  end if;
  return new;
end $$;

drop trigger if exists orders_numero_sequencial on public.orders;
create trigger orders_numero_sequencial before insert or update of order_number on public.orders
  for each row execute function public.orders_numero_sequencial();

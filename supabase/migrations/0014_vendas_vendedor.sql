-- Migration 0014: pedidos de venda com vendedor.
-- Perfil "vendedor", cliente vinculado ao usuario do vendedor, descontos financeiros por cliente,
-- unidade de venda (kg/un) nos itens, retrato do cadastro no pedido e restricao de acesso no servidor:
-- o vendedor so ve os clientes vinculados a ele e os pedidos que ele mesmo lancou; o ADM ve tudo;
-- os demais perfis continuam como antes.

-- 1. Perfil vendedor
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('admin', 'gestor', 'comercial', 'estoque', 'producao', 'operador', 'vendedor'));

create or replace function public.is_seller() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'vendedor' and p.status = 'ativo');
$$;

-- ADM da regra de vendas: nivel administrador ou superadmin (igual ao isAdmin do app).
create or replace function public.is_adm() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'ativo' and (p.access = 'admin' or p.is_superadmin or p.role = 'admin'));
$$;
revoke execute on function public.is_seller() from public, anon;
revoke execute on function public.is_adm() from public, anon;
grant execute on function public.is_seller() to authenticated;
grant execute on function public.is_adm() to authenticated;

-- 2. Cliente: vendedor responsavel e descontos financeiros (percentuais; vazio = nenhum)
alter table public.customers add column if not exists seller_id uuid references public.profiles(id) on delete set null;
alter table public.customers add column if not exists seller_name text;
alter table public.customers add column if not exists financial_discounts numeric[] not null default '{}';
create index if not exists customers_seller_idx on public.customers (seller_id);

create table if not exists public.customer_seller_log (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  old_seller_id uuid,
  new_seller_id uuid,
  old_seller_name text,
  new_seller_name text,
  changed_by uuid default auth.uid(),
  changed_at timestamptz not null default now()
);
alter table public.customer_seller_log enable row level security;
drop policy if exists adm_select on public.customer_seller_log;
create policy adm_select on public.customer_seller_log for select to authenticated using (public.is_adm());

-- So o ADM define o vendedor; toda troca fica registrada.
create or replace function public.customers_seller_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if (new.seller_id is not null or new.seller_name is not null) and not public.is_adm() then
      new.seller_id := null; new.seller_name := null;
    end if;
    return new;
  end if;
  if new.seller_id is distinct from old.seller_id or new.seller_name is distinct from old.seller_name then
    if not public.is_adm() then
      raise exception 'Somente o administrador pode definir o vendedor do cliente.';
    end if;
    insert into public.customer_seller_log (customer_id, old_seller_id, new_seller_id, old_seller_name, new_seller_name)
    values (new.id, old.seller_id, new.seller_id, old.seller_name, new.seller_name);
  end if;
  return new;
end $$;
drop trigger if exists customers_seller_guard on public.customers;
create trigger customers_seller_guard before insert or update on public.customers
  for each row execute function public.customers_seller_guard();

-- 3. Pedido: quem lancou, retrato do cliente e desconto
alter table public.orders add column if not exists created_by uuid default auth.uid() references public.profiles(id) on delete set null;
alter table public.orders add column if not exists customer_name text;
alter table public.orders add column if not exists customer_cnpj text;
alter table public.orders add column if not exists seller_name text;
alter table public.orders add column if not exists subtotal_value numeric;
alter table public.orders add column if not exists discount_pct numeric not null default 0 check (discount_pct >= 0 and discount_pct < 100);
alter table public.orders add column if not exists discount_value numeric not null default 0 check (discount_value >= 0);
create index if not exists orders_created_by_idx on public.orders (created_by);

-- O vendedor nao escolhe o autor do pedido.
create or replace function public.orders_author_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_seller() then
    if tg_op = 'INSERT' then new.created_by := auth.uid(); else new.created_by := old.created_by; end if;
  end if;
  return new;
end $$;
drop trigger if exists orders_author_guard on public.orders;
create trigger orders_author_guard before insert or update on public.orders
  for each row execute function public.orders_author_guard();

-- 4. Itens: unidade de venda e retrato do produto
alter table public.order_items add column if not exists sale_unit text check (sale_unit in ('kg', 'un'));
alter table public.order_items add column if not exists quantity numeric check (quantity is null or quantity > 0);
alter table public.order_items add column if not exists product_reference text;
alter table public.order_items add column if not exists product_name text;

-- 5. Regras de unidade de venda por referencia (editavel em app_settings)
insert into public.app_settings (key, value)
values ('sale_unit_rules', '{"ander": "kg", "isa": "kg", "pote temp": "un", "pote frut": "un", "revenda": "un"}')
on conflict (key) do nothing;

-- 6. Regras de acesso do vendedor (RLS): PENDENTE de aprovacao do responsavel antes de escrever e aplicar.

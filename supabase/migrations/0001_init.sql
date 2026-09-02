-- ISA Alimentos - Sistema de Gestao
-- Migration 0001: schema inicial (produtos, estoque, clientes/CRM, pedidos, producao)

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Utilidades
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Perfis de usuario (espelho de auth.users)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  email text,
  role text not null default 'operador' check (role in ('admin', 'operador')),
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.email,
    case when (select count(*) from public.profiles) = 0 then 'admin' else 'operador' end
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- ---------------------------------------------------------------------------
-- Produtos
-- ---------------------------------------------------------------------------
create table if not exists public.products (
  code text primary key,
  description text not null,
  reference text,
  units_per_box integer not null default 48,
  weight_g numeric,
  unit text not null default 'PT',
  category text,
  min_stock integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger products_updated_at before update on public.products
  for each row execute function public.set_updated_at();

-- Apelidos aprendidos: codigo do cliente e/ou descricao normalizada -> produto
create table if not exists public.product_aliases (
  id uuid primary key default gen_random_uuid(),
  product_code text not null references public.products(code) on delete cascade,
  client_code text,
  description text,
  normalized text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create unique index if not exists product_aliases_client_code_idx
  on public.product_aliases (client_code) where client_code is not null;
create unique index if not exists product_aliases_normalized_idx
  on public.product_aliases (normalized) where normalized is not null;

-- ---------------------------------------------------------------------------
-- Estoque (cada importacao substitui a anterior; historico preservado)
-- ---------------------------------------------------------------------------
create table if not exists public.stock_imports (
  id uuid primary key default gen_random_uuid(),
  file_name text,
  imported_at timestamptz not null default now(),
  imported_by uuid references public.profiles(id),
  locations integer[] not null default '{1,5}',
  rows_total integer not null default 0,
  products_count integer not null default 0,
  total_units numeric not null default 0,
  is_current boolean not null default true
);

create table if not exists public.stock_balances (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.stock_imports(id) on delete cascade,
  product_code text not null references public.products(code) on delete cascade,
  location integer not null,
  quantity numeric not null default 0,
  unique (import_id, product_code, location)
);
create index if not exists stock_balances_import_idx on public.stock_balances (import_id);

-- Apenas uma importacao "atual"
create or replace function public.mark_current_stock_import()
returns trigger language plpgsql as $$
begin
  if new.is_current then
    update public.stock_imports set is_current = false where id <> new.id and is_current;
  end if;
  return new;
end $$;
drop trigger if exists stock_imports_current on public.stock_imports;
create trigger stock_imports_current after insert or update of is_current on public.stock_imports
  for each row execute function public.mark_current_stock_import();

create or replace view public.current_stock as
  select
    p.code,
    p.description,
    p.units_per_box,
    p.min_stock,
    coalesce(sum(b.quantity) filter (where b.location = 1), 0) as location_1,
    coalesce(sum(b.quantity) filter (where b.location = 5), 0) as location_5,
    coalesce(sum(b.quantity), 0) as total,
    max(si.imported_at) as imported_at
  from public.products p
  left join public.stock_imports si on si.is_current
  left join public.stock_balances b on b.import_id = si.id and b.product_code = p.code
  where p.active
  group by p.code, p.description, p.units_per_box, p.min_stock;

-- ---------------------------------------------------------------------------
-- Clientes / CRM
-- ---------------------------------------------------------------------------
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  cnpj text unique,
  name text not null,
  trade_name text,
  group_name text,
  address text,
  city text,
  state text,
  cep text,
  phone text,
  email text,
  contact_name text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger customers_updated_at before update on public.customers
  for each row execute function public.set_updated_at();

create table if not exists public.customer_interactions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  kind text not null default 'observacao'
    check (kind in ('ligacao', 'visita', 'email', 'whatsapp', 'reuniao', 'observacao')),
  content text not null,
  occurred_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists customer_interactions_customer_idx
  on public.customer_interactions (customer_id, occurred_at desc);

-- ---------------------------------------------------------------------------
-- Pedidos
-- ---------------------------------------------------------------------------
create table if not exists public.order_imports (
  id uuid primary key default gen_random_uuid(),
  file_name text,
  imported_at timestamptz not null default now(),
  imported_by uuid references public.profiles(id),
  orders_count integer not null default 0,
  items_count integer not null default 0,
  pending_count integer not null default 0
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  import_id uuid references public.order_imports(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  order_number text,
  order_date date,
  delivery_date date,
  buyer text,
  payment_terms text,
  total_value numeric not null default 0,
  total_weight numeric,
  status text not null default 'aberto'
    check (status in ('aberto', 'em_producao', 'faturado', 'entregue', 'cancelado')),
  source text not null default 'pdf',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists orders_number_customer_idx
  on public.orders (order_number, customer_id) where order_number is not null;
create index if not exists orders_customer_idx on public.orders (customer_id);
create index if not exists orders_date_idx on public.orders (order_date desc);
create trigger orders_updated_at before update on public.orders
  for each row execute function public.set_updated_at();

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  seq integer,
  client_code text,
  raw_description text not null,
  packaging text,
  product_code text references public.products(code) on delete set null,
  quantity_boxes numeric not null default 0,
  units_per_box integer not null default 48,
  quantity_units numeric not null default 0,
  unit_price numeric,
  total_price numeric,
  weight_kg numeric,
  match_status text not null default 'pending'
    check (match_status in ('auto', 'alias', 'manual', 'pending', 'ambiguous', 'not_found')),
  match_score numeric,
  candidates jsonb not null default '[]'::jsonb
);
create index if not exists order_items_order_idx on public.order_items (order_id);
create index if not exists order_items_product_idx on public.order_items (product_code);
create index if not exists order_items_status_idx on public.order_items (match_status);

-- ---------------------------------------------------------------------------
-- Producao (snapshots do calculo de necessidade)
-- ---------------------------------------------------------------------------
create table if not exists public.production_runs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  stock_import_id uuid references public.stock_imports(id) on delete set null,
  order_ids uuid[] not null default '{}',
  status text not null default 'planejado'
    check (status in ('planejado', 'em_andamento', 'concluido')),
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.production_run_items (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.production_runs(id) on delete cascade,
  product_code text not null references public.products(code),
  description text not null,
  stock_available numeric not null default 0,
  ordered_units numeric not null default 0,
  production_need numeric not null default 0,
  remaining numeric not null default 0,
  produced_units numeric not null default 0
);
create index if not exists production_run_items_run_idx on public.production_run_items (run_id);

-- ---------------------------------------------------------------------------
-- Configuracoes
-- ---------------------------------------------------------------------------
create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
insert into public.app_settings (key, value) values
  ('stock_locations', '[1, 5]'),
  ('match_threshold', '0.8'),
  ('match_margin', '0.1'),
  ('company', '{"name": "ISA Ind. de Alimentos e Temperos", "cnpj": "55.747.709/0001-47", "city": "Itaquaquecetuba - SP"}')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- RLS: empresa unica -> qualquer usuario autenticado opera; exclusoes sensiveis so admin
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'products', 'product_aliases', 'stock_imports', 'stock_balances',
    'customers', 'customer_interactions', 'order_imports', 'orders', 'order_items',
    'production_runs', 'production_run_items', 'app_settings'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "auth_select" on public.%I', t);
    execute format('drop policy if exists "auth_insert" on public.%I', t);
    execute format('drop policy if exists "auth_update" on public.%I', t);
    execute format('drop policy if exists "auth_delete" on public.%I', t);
    execute format('create policy "auth_select" on public.%I for select to authenticated using (true)', t);
    execute format('create policy "auth_insert" on public.%I for insert to authenticated with check (true)', t);
    execute format('create policy "auth_update" on public.%I for update to authenticated using (true) with check (true)', t);
    execute format('create policy "auth_delete" on public.%I for delete to authenticated using (true)', t);
  end loop;
end $$;

-- Restricoes extras: apenas admin apaga produtos/clientes e altera perfis
drop policy if exists "auth_delete" on public.products;
create policy "auth_delete" on public.products for delete to authenticated using (public.is_admin());
drop policy if exists "auth_delete" on public.customers;
create policy "auth_delete" on public.customers for delete to authenticated using (public.is_admin());
drop policy if exists "auth_update" on public.profiles;
create policy "auth_update" on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());
drop policy if exists "auth_delete" on public.profiles;
create policy "auth_delete" on public.profiles for delete to authenticated using (public.is_admin());

grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to authenticated;
grant select on public.current_stock to authenticated;

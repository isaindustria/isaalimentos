-- Solicitacao #15 (Rotas de entrega): cadastro de veiculos (modelo, placa, capacidade em kg) para montar as rotas.
create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  model text not null,
  plate text not null unique,
  capacity_kg numeric,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.vehicles enable row level security;
drop policy if exists vehicles_select on public.vehicles;
create policy vehicles_select on public.vehicles for select to authenticated using (public.is_active());
drop policy if exists vehicles_write on public.vehicles;
create policy vehicles_write on public.vehicles for all to authenticated using (public.can_write_area('compras')) with check (public.can_write_area('compras'));
alter table public.delivery_routes add column if not exists vehicle_id uuid references public.vehicles(id) on delete set null;
alter table public.delivery_routes add column if not exists total_weight_kg numeric;

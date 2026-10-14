-- Vendas parte 6, etapa 2 (aprovado pelo responsavel em 14/10/2026):
-- * a Producao passa a ser alimentada pelos pedidos; o cadastro da producao (equivalencia, semiacabado,
--   produto alternativo, producao minima) fica no proprio cadastro de produtos; semiacabados entram como
--   produtos de referencia SEMIACABADO (aparecem no Estoque, nao aparecem no pedido de venda);
-- * cada item do pedido tem a sua etapa (o pedido pode ficar parcial: parte na producao, parte no faturamento);
-- * o PCP (area producao) muda so Aberto -> Em producao -> Faturamento e volta para Aberto;
--   o faturamento (area compras, a mesma das rotas) muda Aberto -> Faturamento -> Entregue e volta para Aberto.

alter table public.products add column if not exists equivalence_kg numeric;      -- kg de 1 unidade de venda (vazio = peso do cadastro)
alter table public.products add column if not exists semi_code text;              -- codigo do semiacabado vinculado
alter table public.products add column if not exists alt_code text;               -- produto alternativo (mesma base, outra embalagem)
alter table public.products add column if not exists min_production_kg numeric;   -- no semiacabado: producao minima
alter table public.products add column if not exists is_semi boolean not null default false;

alter table public.order_items add column if not exists stage text not null default 'aberto'
  check (stage in ('aberto', 'em_producao', 'faturado', 'entregue'));
alter table public.order_items add column if not exists stage_at timestamptz;
alter table public.order_items add column if not exists stage_by uuid references public.profiles(id) on delete set null;

-- status do pedido = etapa menos avancada dos itens (cancelado continua cancelado)
create or replace function public.recalc_order_status(p_order uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v text;
begin
  select case min(case stage when 'aberto' then 1 when 'em_producao' then 2 when 'faturado' then 3 else 4 end)
           when 1 then 'aberto' when 2 then 'em_producao' when 3 then 'faturado' when 4 then 'entregue' end
    into v from public.order_items where order_id = p_order;
  if v is not null then
    update public.orders set status = v, updated_at = now() where id = p_order and status <> 'cancelado' and status <> v;
  end if;
end $$;

create or replace function public.set_item_stage(p_item_ids uuid[], p_stage text)
returns int language plpgsql security definer set search_path = public as $$
declare n int; o uuid;
begin
  if p_stage not in ('aberto', 'em_producao', 'faturado', 'entregue') then raise exception 'Etapa inválida.'; end if;
  if not (public.can_write_area('compras') or (public.can_write_area('producao') and p_stage in ('aberto', 'em_producao', 'faturado'))) then
    raise exception 'Você não tem permissão para mudar para esta etapa.';
  end if;
  if exists (select 1 from public.order_items i join public.orders r on r.id = i.order_id where i.id = any(p_item_ids) and r.status = 'cancelado') then
    raise exception 'Pedido cancelado não muda de etapa.';
  end if;
  update public.order_items set stage = p_stage, stage_at = now(), stage_by = auth.uid() where id = any(p_item_ids);
  get diagnostics n = row_count;
  for o in select distinct order_id from public.order_items where id = any(p_item_ids) loop
    perform public.recalc_order_status(o);
  end loop;
  return n;
end $$;

revoke all on function public.recalc_order_status(uuid) from public, anon, authenticated;
revoke all on function public.set_item_stage(uuid[], text) from public, anon;
grant execute on function public.set_item_stage(uuid[], text) to authenticated;

-- pedidos ja existentes: itens acompanham o status atual do pedido
update public.order_items i set stage = case r.status when 'em_producao' then 'em_producao' when 'faturado' then 'faturado' when 'entregue' then 'entregue' else 'aberto' end
  from public.orders r where r.id = i.order_id and i.stage = 'aberto' and r.status in ('em_producao', 'faturado', 'entregue');

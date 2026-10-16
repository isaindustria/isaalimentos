-- Solicitacao #17: fluxo Faturamento -> Montar rota -> Rotas -> Relatorio.
-- rota_etapa = 'faturamento' quando o pedido foi devolvido de Montar rota para o Faturamento
-- (sem isso, pedido com todos os itens em Faturamento vai sozinho para Montar rota).
alter table public.orders add column if not exists rota_etapa text check (rota_etapa in ('faturamento'));
alter table public.delivery_routes add column if not exists delivered_at timestamptz;

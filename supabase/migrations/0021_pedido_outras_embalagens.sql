-- Vendas parte 4: pergunta do pedido "Pode enviar em outras embalagens de medida a quantidade solicitada?"
-- (ex.: 10 kg pedidos podem sair em 2 embalagens de 5 kg). null = pedido antigo, sem resposta.
alter table public.orders add column if not exists allow_other_packaging boolean;

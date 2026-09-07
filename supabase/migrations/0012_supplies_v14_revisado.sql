-- Migration 0012 (v1.4 comandos revisados): separa cadastro de matéria-prima do estoque atual.
-- Estoque atual = soma dos locais 2 e 6 (stock = stock2 + stock6), gravado pela importação de estoque.
-- O cadastro (referência, código, nome) é gravado pela importação de cadastro, sem mexer no estoque.
alter table public.supplies add column if not exists stock2 numeric not null default 0;
alter table public.supplies add column if not exists stock6 numeric not null default 0;

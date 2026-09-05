-- Migration 0010 (v1.3 do gestor, aba Clientes): bairro no cadastro.
alter table public.customers add column if not exists district text;

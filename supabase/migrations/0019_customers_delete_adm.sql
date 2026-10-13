-- Vendas parte 3: o ADM pode excluir clientes (com confirmacao na tela). A regra de exclusao tinha sumido em 0011,
-- entao a exclusao era ignorada em silencio. Clientes com pedidos sao inativados pela tela, nao excluidos.
drop policy if exists auth_delete on public.customers;
create policy auth_delete on public.customers for delete to authenticated using (public.is_admin());

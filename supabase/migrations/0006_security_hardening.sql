-- Migration 0006: endurecimento (aplicado via MCP): view current_stock com security_invoker,
-- search_path fixo nas funcoes, funcoes internas sem EXECUTE via API, anon sem privilegios em public.
alter view public.current_stock set (security_invoker = true);
alter function public.set_updated_at() set search_path = public;
alter function public.mark_current_stock_import() set search_path = public;
alter function public.protect_superadmin() set search_path = public;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.handle_user_email_change() from public, anon, authenticated;
revoke execute on function public.notify_pending_profile() from public, anon, authenticated;
revoke execute on function public.attach_current_import() from public, anon, authenticated;
revoke execute on function public.protect_superadmin() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.mark_current_stock_import() from public, anon, authenticated;
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.is_active() from public, anon;
revoke execute on function public.can_write() from public, anon;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_active() to authenticated;
grant execute on function public.can_write() to authenticated;
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on functions from anon;
alter default privileges in schema public revoke execute on functions from public;

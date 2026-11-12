-- Correções apontadas pelo Security Advisor do Supabase (12/11/2026).
alter function public.set_atualizado_em() set search_path = public;
alter function public.minimo_dias_chegada(integer, integer) set search_path = public;
alter function public.sou(perfil_acesso[]) set search_path = public;
-- Trigger de auth não deve ser chamável pela API; meu_perfil() só para usuários logados.
revoke execute on function public.on_auth_user_created() from anon, authenticated, public;
revoke execute on function public.meu_perfil() from anon, public;

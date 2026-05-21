drop trigger if exists consorcios_audit_trigger on public.consorcios;

create trigger consorcios_audit_trigger
after update on public.consorcios
for each row execute function public.log_platform_audit_event();
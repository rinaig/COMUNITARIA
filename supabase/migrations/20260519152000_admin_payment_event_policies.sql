do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'admin_payment_events'
      and policyname = 'tenant_payment_events_select'
  ) then
    create policy "tenant_payment_events_select"
    on public.admin_payment_events
    for select
    using (
      public.is_superadmin()
      or (
        consorcio_id = public.current_consorcio_id()
        and public.current_role() = 'admin'
      )
    );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'admin_payment_events'
      and policyname = 'tenant_payment_events_insert'
  ) then
    create policy "tenant_payment_events_insert"
    on public.admin_payment_events
    for insert
    with check (
      consorcio_id = public.current_consorcio_id()
      and public.current_role() = 'admin'
      and registrado_por = auth.uid()
    );
  end if;
end;
$$;
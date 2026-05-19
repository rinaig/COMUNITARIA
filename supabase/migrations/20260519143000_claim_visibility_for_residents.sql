drop policy if exists "tenant_reclamos_select" on public.reclamos;
drop policy if exists "tenant_reclamo_eventos_select" on public.reclamo_eventos;

drop function if exists public.create_claim_ticket(text, text, text, text);

create or replace function public.create_claim_ticket(
  p_titulo text,
  p_categoria text,
  p_descripcion text,
  p_foto_url text default null,
  p_visible_para_todo_consorcio boolean default true
)
returns table(claim_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  profile_consorcio_id uuid;
  profile_unit_code text;
  resolved_unit_id uuid;
  created_claim_id uuid;
begin
  if current_user_id is null then
    raise exception 'Usuario no autenticado';
  end if;

  if coalesce(trim(p_titulo), '') = '' or coalesce(trim(p_descripcion), '') = '' then
    raise exception 'Titulo y descripcion son obligatorios';
  end if;

  select consorcio_id, unidad_funcional
  into profile_consorcio_id, profile_unit_code
  from public.profiles
  where id = current_user_id;

  if profile_consorcio_id is null then
    raise exception 'Tu cuenta no esta vinculada a un consorcio';
  end if;

  if profile_unit_code is not null then
    select id
    into resolved_unit_id
    from public.unidades_funcionales
    where consorcio_id = profile_consorcio_id
      and upper(codigo) = upper(profile_unit_code)
    limit 1;
  end if;

  insert into public.reclamos (
    consorcio_id,
    creador_id,
    unidad_id,
    titulo,
    categoria,
    descripcion,
    foto_url,
    estado,
    visible_para_todo_consorcio
  )
  values (
    profile_consorcio_id,
    current_user_id,
    resolved_unit_id,
    trim(p_titulo),
    nullif(trim(coalesce(p_categoria, '')), ''),
    trim(p_descripcion),
    nullif(trim(coalesce(p_foto_url, '')), ''),
    'pendiente',
    coalesce(p_visible_para_todo_consorcio, true)
  )
  returning id into created_claim_id;

  insert into public.reclamo_eventos (consorcio_id, reclamo_id, actor_id, estado, comentario)
  values (profile_consorcio_id, created_claim_id, current_user_id, 'pendiente', 'Reclamo creado desde el portal residente');

  perform public.create_notification(
    profile_consorcio_id,
    'reclamos',
    'Nuevo reclamo',
    concat('Se registro un reclamo: ', trim(p_titulo)),
    'admin',
    null,
    jsonb_build_object('claim_id', created_claim_id)
  );

  return query select created_claim_id;
end;
$$;

grant execute on function public.create_claim_ticket(text, text, text, text, boolean) to authenticated;

create policy "tenant_reclamos_select"
on public.reclamos
for select
using (
  public.is_superadmin()
  or (consorcio_id = public.current_consorcio_id() and public.current_role() = 'admin')
  or (consorcio_id = public.current_consorcio_id() and visible_para_todo_consorcio = true)
  or creador_id = auth.uid()
);

create policy "tenant_reclamo_eventos_select"
on public.reclamo_eventos
for select
using (
  public.is_superadmin()
  or (consorcio_id = public.current_consorcio_id() and public.current_role() = 'admin')
  or exists (
    select 1
    from public.reclamos r
    where r.id = reclamo_id
      and r.consorcio_id = public.current_consorcio_id()
      and r.visible_para_todo_consorcio = true
  )
  or exists (
    select 1
    from public.reclamos r
    where r.id = reclamo_id
      and r.creador_id = auth.uid()
  )
);
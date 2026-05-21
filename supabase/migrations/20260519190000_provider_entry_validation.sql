create or replace function public.register_provider_entry(
  p_proveedor_id uuid,
  p_note text default null,
  p_punto_vigilancia_id uuid default null
)
returns table(provider_id uuid, provider_name text, entry_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  access_role public.app_role := public.current_role();
  provider_record public.proveedores%rowtype;
  selected_point_id uuid;
  missing_required_documents text[];
  expired_required_documents text[];
  created_entry_id uuid;
begin
  if current_user_id is null then
    raise exception 'Usuario no autenticado';
  end if;

  if not public.is_superadmin() and access_role not in ('admin', 'seguridad') then
    raise exception 'No tienes permisos para registrar ingresos de proveedores';
  end if;

  select *
  into provider_record
  from public.proveedores
  where id = p_proveedor_id
    and activo = true
    and (
      public.is_superadmin()
      or consorcio_id = public.current_consorcio_id()
    )
  limit 1;

  if provider_record.id is null then
    raise exception 'No se encontro un proveedor activo para registrar';
  end if;

  if p_punto_vigilancia_id is not null then
    select id
    into selected_point_id
    from public.puntos_vigilancia
    where id = p_punto_vigilancia_id
      and consorcio_id = provider_record.consorcio_id
      and activo = true
    limit 1;

    if selected_point_id is null then
      raise exception 'El punto de vigilancia indicado no esta disponible para este consorcio';
    end if;
  end if;

  select array_agg(req.nombre order by req.nombre)
  into missing_required_documents
  from public.proveedor_documento_requisitos req
  left join lateral (
    select doc.vence_el
    from public.proveedor_documentos doc
    where doc.consorcio_id = provider_record.consorcio_id
      and doc.proveedor_id = provider_record.id
      and (
        doc.requisito_id = req.id
        or doc.tipo::text = req.codigo
      )
    order by doc.vence_el desc
    limit 1
  ) latest_doc on true
  where req.consorcio_id = provider_record.consorcio_id
    and req.requerido = true
    and latest_doc.vence_el is null;

  if coalesce(array_length(missing_required_documents, 1), 0) > 0 then
    raise exception 'Ingreso bloqueado. Faltan documentos obligatorios: %', array_to_string(missing_required_documents, ', ');
  end if;

  select array_agg(req.nombre order by req.nombre)
  into expired_required_documents
  from public.proveedor_documento_requisitos req
  join lateral (
    select doc.vence_el
    from public.proveedor_documentos doc
    where doc.consorcio_id = provider_record.consorcio_id
      and doc.proveedor_id = provider_record.id
      and (
        doc.requisito_id = req.id
        or doc.tipo::text = req.codigo
      )
    order by doc.vence_el desc
    limit 1
  ) latest_doc on true
  where req.consorcio_id = provider_record.consorcio_id
    and req.requerido = true
    and latest_doc.vence_el < current_date;

  if coalesce(array_length(expired_required_documents, 1), 0) > 0 then
    raise exception 'Ingreso bloqueado. Documentacion vencida: %', array_to_string(expired_required_documents, ', ');
  end if;

  insert into public.ingresos_guardia (
    consorcio_id,
    proveedor_id,
    guardia_id,
    punto_vigilancia_id,
    descripcion
  )
  values (
    provider_record.consorcio_id,
    provider_record.id,
    current_user_id,
    selected_point_id,
    concat(
      'Ingreso proveedor: ',
      provider_record.nombre,
      case
        when provider_record.empresa is not null and trim(provider_record.empresa) <> '' then concat(' · ', trim(provider_record.empresa))
        else ''
      end,
      case
        when p_note is not null and trim(p_note) <> '' then concat(' · ', trim(p_note))
        else ''
      end
    )
  )
  returning id into created_entry_id;

  return query
  select provider_record.id, provider_record.nombre, created_entry_id;
end;
$$;

grant execute on function public.register_provider_entry(uuid, text, uuid) to authenticated;

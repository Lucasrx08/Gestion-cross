create or replace function public.cross_update_heat_metadata_internal(
  p_heat_id uuid,
  p_owner_key_hash text,
  p_name text,
  p_scheduled_time time without time zone,
  p_challenge_enabled boolean
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_heat public.cross_heats%rowtype;
begin
  if p_name is null or length(trim(p_name)) = 0 or length(trim(p_name)) > 160 then
    raise exception 'NOM_COURSE_REQUIS';
  end if;

  select heat.*
  into v_heat
  from public.cross_heats as heat
  join public.cross_events as event on event.id = heat.event_id
  where heat.id = p_heat_id
    and event.owner_key_hash = p_owner_key_hash
  for update of heat;

  if not found then
    raise exception 'COURSE_INTROUVABLE';
  end if;

  update public.cross_heats
  set name = trim(p_name),
      scheduled_time = p_scheduled_time,
      challenge_enabled = coalesce(p_challenge_enabled, false),
      updated_at = now()
  where id = p_heat_id
  returning * into v_heat;

  return jsonb_build_object('heat', to_jsonb(v_heat));
end;
$function$;

revoke all on function public.cross_update_heat_metadata_internal(uuid, text, text, time without time zone, boolean) from public, anon, authenticated;
grant execute on function public.cross_update_heat_metadata_internal(uuid, text, text, time without time zone, boolean) to service_role;

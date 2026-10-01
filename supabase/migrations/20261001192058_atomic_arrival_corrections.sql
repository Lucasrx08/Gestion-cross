-- Même ordre de verrous que les scans : course puis arrivée.
-- Aucune modification de schéma ni réécriture des résultats existants.
create or replace function public.cross_set_entry_status_internal(
  p_entry_id uuid, p_owner_key_hash text, p_status text
) returns jsonb
language plpgsql security invoker
set search_path = public, pg_temp
as $function$
declare
  v_heat public.cross_heats%rowtype;
  v_entry public.cross_entries%rowtype;
begin
  if p_status is null or p_status not in ('registered','dnf','exempt','absent') then
    raise exception 'STATUT_INVALIDE';
  end if;
  select h.* into v_heat from public.cross_heats h
    join public.cross_events e on e.id = h.event_id
    join public.cross_entries a on a.heat_id = h.id
    where a.id = p_entry_id and e.owner_key_hash = p_owner_key_hash
    for update of h;
  if not found then raise exception 'PARTICIPANT_INTROUVABLE'; end if;
  select * into v_entry from public.cross_entries where id = p_entry_id for update;
  if v_entry.status = 'finished' then raise exception 'SUPPRIMER_ARRIVEE_DABORD'; end if;
  if v_heat.status = 'finished' and p_status = 'registered' then
    raise exception 'COURSE_TERMINEE_VERROUILLEE';
  end if;
  update public.cross_entries set status = p_status, updated_at = now() where id = p_entry_id;
  return jsonb_build_object('ok', true);
end;
$function$;

create or replace function public.cross_remove_finish_internal(
  p_entry_id uuid, p_owner_key_hash text
) returns jsonb
language plpgsql security invoker
set search_path = public, pg_temp
as $function$
declare
  v_heat public.cross_heats%rowtype;
  v_entry public.cross_entries%rowtype;
  v_status text;
begin
  select h.* into v_heat from public.cross_heats h
    join public.cross_events e on e.id = h.event_id
    join public.cross_entries a on a.heat_id = h.id
    where a.id = p_entry_id and e.owner_key_hash = p_owner_key_hash
    for update of h;
  if not found then raise exception 'ARRIVEE_INTROUVABLE'; end if;
  select * into v_entry from public.cross_entries where id = p_entry_id for update;
  if v_entry.status <> 'finished' then raise exception 'ARRIVEE_INTROUVABLE'; end if;
  v_status := case when v_heat.status = 'finished' then 'dnf' else 'registered' end;
  delete from public.cross_scans where entry_id = p_entry_id;
  update public.cross_entries set status = v_status, finish_position = null,
    station_order = null, station_position = null, elapsed_ms = null,
    scanned_at = null, station_id = null, updated_at = now() where id = p_entry_id;
  perform public.cross_recompute_segmented_positions(v_heat.id);
  return jsonb_build_object('removed', true, 'status', v_status);
end;
$function$;

revoke all on function public.cross_set_entry_status_internal(uuid,text,text) from public, anon, authenticated;
revoke all on function public.cross_remove_finish_internal(uuid,text) from public, anon, authenticated;
grant execute on function public.cross_set_entry_status_internal(uuid,text,text) to service_role;
grant execute on function public.cross_remove_finish_internal(uuid,text) to service_role;

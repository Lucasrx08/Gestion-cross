-- Sérialiser préparation / réimport / suppression au niveau du cross.
create or replace function public.cross_save_heat_plan_internal(
  p_event_id uuid, p_owner_key_hash text, p_heat_id uuid, p_name text,
  p_selected_classes text[], p_sex_filter text, p_challenge_enabled boolean,
  p_challenge_classes text[], p_participant_ids text[], p_scheduled_time time without time zone
) returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $function$
declare
  v_heat public.cross_heats%rowtype;
  v_ids uuid[];
begin
  perform 1 from public.cross_events e where e.id = p_event_id and e.owner_key_hash = p_owner_key_hash for update;
  if not found then raise exception 'EVENEMENT_INTROUVABLE'; end if;
  if p_name is null or length(trim(p_name)) = 0 or length(trim(p_name)) > 160 then raise exception 'NOM_COURSE_REQUIS'; end if;
  if p_sex_filter is null or p_sex_filter not in ('all','female','male') then raise exception 'FILTRE_INVALIDE'; end if;
  select array_agg(p.id) into v_ids from public.cross_participants p
    where p.event_id = p_event_id and p.is_active = true and p.local_participant_id = any(p_participant_ids);
  if coalesce(cardinality(v_ids),0) = 0 then raise exception 'AUCUN_PARTICIPANT'; end if;
  if cardinality(v_ids) <> cardinality(p_participant_ids) then raise exception 'PARTICIPANT_INTROUVABLE'; end if;
  if p_heat_id is null then
    insert into public.cross_heats(event_id,name) values (p_event_id,trim(p_name)) returning * into v_heat;
  else
    select * into v_heat from public.cross_heats h where h.id = p_heat_id and h.event_id = p_event_id for update;
    if not found then raise exception 'COURSE_INTROUVABLE'; end if;
    if v_heat.status <> 'draft' then raise exception 'COURSE_DEJA_DEMARREE'; end if;
  end if;
  update public.cross_heats h set name = trim(p_name), selected_classes = p_selected_classes,
    sex_filter = p_sex_filter, challenge_enabled = p_challenge_enabled,
    challenge_classes = p_challenge_classes, challenge_best_count = null,
    scheduled_time = p_scheduled_time, updated_at = now()
    where h.id = v_heat.id returning * into v_heat;
  delete from public.cross_entries e where e.heat_id = v_heat.id and not (e.participant_id = any(v_ids));
  insert into public.cross_entries(heat_id,participant_id)
    select v_heat.id, unnest(v_ids) on conflict (heat_id,participant_id) do nothing;
  return jsonb_build_object('heat',to_jsonb(v_heat),'participantCount',cardinality(v_ids));
end;
$function$;

create or replace function public.cross_delete_heat_internal(p_heat_id uuid, p_owner_key_hash text)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $function$
declare
  v_heat public.cross_heats%rowtype;
  v_event_id uuid;
begin
  select h.event_id into v_event_id from public.cross_heats h where h.id = p_heat_id;
  perform 1 from public.cross_events e where e.id = v_event_id and e.owner_key_hash = p_owner_key_hash for update;
  if not found then raise exception 'COURSE_INTROUVABLE'; end if;
  select * into v_heat from public.cross_heats where id = p_heat_id for update;
  if not found then raise exception 'COURSE_INTROUVABLE'; end if;
  if v_heat.status = 'running' then raise exception 'TERMINER_LA_COURSE_DABORD'; end if;
  delete from public.cross_heats where id = p_heat_id;
  return jsonb_build_object('deleted', true);
end;
$function$;

create or replace function public.cross_delete_event_internal(p_local_event_id text, p_owner_key_hash text)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $function$
declare
  v_event public.cross_events%rowtype;
begin
  select * into v_event from public.cross_events
    where local_event_id = p_local_event_id and owner_key_hash = p_owner_key_hash for update;
  if not found then return jsonb_build_object('deleted', false); end if;
  perform 1 from public.cross_heats where event_id = v_event.id order by id for update;
  if exists(select 1 from public.cross_heats where event_id = v_event.id and status = 'running') then
    raise exception 'TERMINER_LA_COURSE_DABORD';
  end if;
  delete from public.cross_events where id = v_event.id;
  return jsonb_build_object('deleted', true);
end;
$function$;

revoke all on function public.cross_save_heat_plan_internal(uuid,text,uuid,text,text[],text,boolean,text[],text[],time without time zone) from public, anon, authenticated;
revoke all on function public.cross_delete_heat_internal(uuid,text) from public, anon, authenticated;
revoke all on function public.cross_delete_event_internal(text,text) from public, anon, authenticated;
grant execute on function public.cross_save_heat_plan_internal(uuid,text,uuid,text,text[],text,boolean,text[],text[],time without time zone) to service_role;
grant execute on function public.cross_delete_heat_internal(uuid,text) to service_role;
grant execute on function public.cross_delete_event_internal(text,text) to service_role;

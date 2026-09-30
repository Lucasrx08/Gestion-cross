-- Prepared heats remain drafts until the organiser explicitly starts them.
alter table public.cross_heats add column if not exists scheduled_time time without time zone;

-- Keep final positions unique while a new segment shifts previously scanned ranks.
create or replace function public.cross_recompute_segmented_positions(p_heat_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $function$
begin
  perform 1 from public.cross_heats h where h.id = p_heat_id for update;
  set constraints cross_entries_heat_position_key, cross_scans_heat_position_key deferred;
  with ranked as (
    select e.id, row_number() over (order by e.station_order asc nulls last, e.station_position asc nulls last, e.scanned_at asc, e.id asc)::integer as pos
    from public.cross_entries e where e.heat_id = p_heat_id and e.status = 'finished'
  )
  update public.cross_entries e set finish_position = r.pos from ranked r where e.id = r.id;
  update public.cross_scans s set position = e.finish_position
    from public.cross_entries e where s.entry_id = e.id and e.heat_id = p_heat_id and e.status = 'finished';
  update public.cross_heats h set next_position = (
    select count(*)::integer from public.cross_entries e where e.heat_id = p_heat_id and e.status = 'finished'
  ) where h.id = p_heat_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.cross_register_segmented_scan_internal(p_station_code_hash text, p_bib_code text, p_station_id text)
 RETURNS TABLE(entry_id uuid, participant_id uuid, bib_code text, first_name text, last_name text, class_name text, sex text, finish_position integer, station_order integer, station_position integer, elapsed_ms bigint, scanned_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_heat public.cross_heats%rowtype;
  v_station public.cross_stations%rowtype;
  v_entry_id uuid; v_participant_id uuid; v_bib text; v_first text; v_last text; v_class text; v_sex text; v_status text;
  v_local integer; v_now timestamptz:=clock_timestamp(); v_elapsed bigint; v_input text:=upper(trim(p_bib_code)); v_numeric integer; v_finish integer;
begin
  set constraints cross_entries_heat_position_key, cross_scans_heat_position_key deferred;
  select * into v_heat from public.cross_heats where station_code_hash=p_station_code_hash for update;
  if not found then raise exception 'CODE_INVALIDE' using errcode='P0001'; end if;
  if v_heat.status<>'running' then raise exception 'COURSE_NON_DEMARREE' using errcode='P0001'; end if;
  select * into v_station from public.cross_stations where heat_id=v_heat.id and client_station_id=p_station_id and status='active';
  if not found then raise exception 'POSTE_NON_ENREGISTRE' using errcode='P0001'; end if;
  if v_input ~ '^[0-9]+$' then begin v_numeric:=v_input::integer; exception when others then v_numeric:=null; end; end if;
  select ce.id,cp.id,cp.bib_code,cp.first_name,cp.last_name,cp.class_name,cp.sex,ce.status
  into v_entry_id,v_participant_id,v_bib,v_first,v_last,v_class,v_sex,v_status
  from public.cross_entries ce join public.cross_participants cp on cp.id=ce.participant_id
  where ce.heat_id=v_heat.id and (upper(cp.bib_code)=v_input or (v_numeric is not null and cp.bib_number=v_numeric)) limit 1;
  if not found then raise exception 'DOSSARD_INCONNU' using errcode='P0001'; end if;
  if v_status='finished' then raise exception 'DOSSARD_DEJA_SCANNÉ' using errcode='P0001'; end if;
  if v_status='exempt' then raise exception 'PARTICIPANT_DISPENSÉ' using errcode='P0001'; end if;
  if v_status='absent' then raise exception 'PARTICIPANT_ABSENT' using errcode='P0001'; end if;
  select coalesce(max(ce.station_position),0)+1 into v_local from public.cross_entries ce where ce.heat_id=v_heat.id and ce.status='finished' and ce.station_order=v_station.station_order;
  v_elapsed:=greatest(0,floor(extract(epoch from (v_now-v_heat.started_at))*1000)::bigint);
  update public.cross_entries set status='finished',station_order=v_station.station_order,station_position=v_local,elapsed_ms=v_elapsed,scanned_at=v_now,station_id=p_station_id where id=v_entry_id;
  insert into public.cross_scans(heat_id,entry_id,bib_code,position,elapsed_ms,station_id,scanned_at,station_order,station_position) values(v_heat.id,v_entry_id,v_bib,v_heat.next_position+1,v_elapsed,p_station_id,v_now,v_station.station_order,v_local);
  perform public.cross_recompute_segmented_positions(v_heat.id);
  select ce.finish_position into v_finish from public.cross_entries ce where ce.id=v_entry_id;
  update public.cross_scans s set position=v_finish where s.entry_id=v_entry_id and s.scanned_at=v_now;
  return query select v_entry_id,v_participant_id,v_bib,v_first,v_last,v_class,v_sex,v_finish,v_station.station_order,v_local,v_elapsed,v_now;
end;$function$;


-- Atomic creation/editing preserves absent/exempt statuses for pupils kept in a draft.
create or replace function public.cross_save_heat_plan_internal(
  p_event_id uuid, p_owner_key_hash text, p_heat_id uuid, p_name text,
  p_selected_classes text[], p_sex_filter text, p_challenge_enabled boolean,
  p_challenge_classes text[], p_participant_ids text[], p_scheduled_time time without time zone
) returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $function$
declare
  v_heat public.cross_heats%rowtype;
  v_ids uuid[];
begin
  if not exists (select 1 from public.cross_events e where e.id = p_event_id and e.owner_key_hash = p_owner_key_hash)
    then raise exception 'EVENEMENT_INTROUVABLE'; end if;
  if length(trim(p_name)) = 0 or length(trim(p_name)) > 160 then raise exception 'NOM_COURSE_REQUIS'; end if;
  if p_sex_filter not in ('all','female','male') then raise exception 'FILTRE_INVALIDE'; end if;
  select array_agg(p.id) into v_ids from public.cross_participants p
    where p.event_id = p_event_id and p.local_participant_id = any(p_participant_ids);
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
    challenge_classes = p_challenge_classes, challenge_best_count = null, scheduled_time = p_scheduled_time
    where h.id = v_heat.id returning * into v_heat;
  delete from public.cross_entries e where e.heat_id = v_heat.id and not (e.participant_id = any(v_ids));
  insert into public.cross_entries(heat_id,participant_id)
    select v_heat.id, unnest(v_ids) on conflict (heat_id,participant_id) do nothing;
  return jsonb_build_object('heat',to_jsonb(v_heat),'participantCount',cardinality(v_ids));
end;
$function$;

revoke all on function public.cross_save_heat_plan_internal(uuid,text,uuid,text,text[],text,boolean,text[],text[],time without time zone) from public, anon, authenticated;
grant execute on function public.cross_save_heat_plan_internal(uuid,text,uuid,text,text[],text,boolean,text[],text[],time without time zone) to service_role;
-- Existing internal scan functions stay restricted to the server role.
revoke all on function public.cross_register_segmented_scan_internal(text,text,text) from public, anon, authenticated;
grant execute on function public.cross_register_segmented_scan_internal(text,text,text) to service_role;
revoke all on function public.cross_recompute_segmented_positions(uuid) from public, anon, authenticated;
grant execute on function public.cross_recompute_segmented_positions(uuid) to service_role;

-- Un dossard ne doit plus être bloqué à l'arrivée lorsque le sexe importé est erroné.
-- Le rattrapage reste limité aux élèves actifs d'une classe sélectionnée dans
-- une course explicitement Filles ou Garçons. Le sexe importé n'est pas modifié :
-- la correction est propre à cette course et reste traçable sur l'engagement.

alter table public.cross_entries
  add column if not exists sex_override text,
  add column if not exists sex_corrected_at_scan boolean not null default false;

alter table public.cross_entries
  drop constraint if exists cross_entries_sex_override_check;
alter table public.cross_entries
  add constraint cross_entries_sex_override_check
  check (sex_override is null or sex_override in ('F', 'M'));

drop function if exists public.cross_register_segmented_scan_internal(text, text, text);

create function public.cross_register_segmented_scan_internal(
  p_station_code_hash text,
  p_bib_code text,
  p_station_id text
)
returns table(
  entry_id uuid,
  participant_id uuid,
  bib_code text,
  first_name text,
  last_name text,
  class_name text,
  sex text,
  sex_corrected boolean,
  finish_position integer,
  station_order integer,
  station_position integer,
  elapsed_ms bigint,
  scanned_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_heat public.cross_heats%rowtype;
  v_station public.cross_stations%rowtype;
  v_entry_id uuid;
  v_participant_id uuid;
  v_bib text;
  v_first text;
  v_last text;
  v_class text;
  v_sex text;
  v_status text;
  v_corrected boolean := false;
  v_local integer;
  v_now timestamptz := clock_timestamp();
  v_elapsed bigint;
  v_input text := upper(trim(p_bib_code));
  v_numeric integer;
  v_finish integer;
begin
  set constraints cross_entries_heat_position_key, cross_scans_heat_position_key deferred;

  select * into v_heat
  from public.cross_heats
  where station_code_hash = p_station_code_hash
  for update;
  if not found then raise exception 'CODE_INVALIDE' using errcode = 'P0001'; end if;
  if v_heat.status <> 'running' then raise exception 'COURSE_NON_DEMARREE' using errcode = 'P0001'; end if;

  select * into v_station
  from public.cross_stations
  where heat_id = v_heat.id
    and client_station_id = p_station_id
    and status = 'active';
  if not found then raise exception 'POSTE_NON_ENREGISTRE' using errcode = 'P0001'; end if;

  if v_input ~ '^[0-9]+$' then
    begin
      v_numeric := v_input::integer;
    exception when others then
      v_numeric := null;
    end;
  end if;

  select ce.id, cp.id, cp.bib_code, cp.first_name, cp.last_name,
    cp.class_name, coalesce(ce.sex_override, cp.sex), ce.status,
    ce.sex_corrected_at_scan
  into v_entry_id, v_participant_id, v_bib, v_first, v_last,
    v_class, v_sex, v_status, v_corrected
  from public.cross_entries ce
  join public.cross_participants cp on cp.id = ce.participant_id
  where ce.heat_id = v_heat.id
    and (upper(cp.bib_code) = v_input or (v_numeric is not null and cp.bib_number = v_numeric))
  limit 1;

  if not found then
    -- Rattrapage uniquement si la classe appartient bien à la course et que
    -- celle-ci donne une catégorie de sexe non ambiguë.
    if v_heat.sex_filter not in ('female', 'male') then
      raise exception 'DOSSARD_INCONNU' using errcode = 'P0001';
    end if;

    select cp.id, cp.bib_code, cp.first_name, cp.last_name, cp.class_name
    into v_participant_id, v_bib, v_first, v_last, v_class
    from public.cross_participants cp
    where cp.event_id = v_heat.event_id
      and cp.is_active = true
      and cp.class_name = any(v_heat.selected_classes)
      and (upper(cp.bib_code) = v_input or (v_numeric is not null and cp.bib_number = v_numeric))
    limit 1
    for update;

    if not found then raise exception 'DOSSARD_INCONNU' using errcode = 'P0001'; end if;

    v_sex := case when v_heat.sex_filter = 'female' then 'F' else 'M' end;
    insert into public.cross_entries(
      heat_id, participant_id, sex_override, sex_corrected_at_scan
    ) values (
      v_heat.id, v_participant_id, v_sex, true
    )
    returning id, status into v_entry_id, v_status;
    v_corrected := true;
  end if;

  if v_status = 'finished' then raise exception 'DOSSARD_DEJA_SCANNÉ' using errcode = 'P0001'; end if;
  if v_status = 'exempt' then raise exception 'PARTICIPANT_DISPENSÉ' using errcode = 'P0001'; end if;
  if v_status = 'absent' then raise exception 'PARTICIPANT_ABSENT' using errcode = 'P0001'; end if;

  select coalesce(max(ce.station_position), 0) + 1 into v_local
  from public.cross_entries ce
  where ce.heat_id = v_heat.id
    and ce.status = 'finished'
    and ce.station_order = v_station.station_order;

  v_elapsed := greatest(0, floor(extract(epoch from (v_now - v_heat.started_at)) * 1000)::bigint);
  update public.cross_entries set
    status = 'finished',
    station_order = v_station.station_order,
    station_position = v_local,
    elapsed_ms = v_elapsed,
    scanned_at = v_now,
    station_id = p_station_id,
    updated_at = now()
  where id = v_entry_id;

  insert into public.cross_scans(
    heat_id, entry_id, bib_code, position, elapsed_ms, station_id,
    scanned_at, station_order, station_position
  ) values (
    v_heat.id, v_entry_id, v_bib, v_heat.next_position + 1, v_elapsed,
    p_station_id, v_now, v_station.station_order, v_local
  );

  perform public.cross_recompute_segmented_positions(v_heat.id);
  select ce.finish_position into v_finish
  from public.cross_entries ce where ce.id = v_entry_id;
  update public.cross_scans s set position = v_finish
  where s.entry_id = v_entry_id and s.scanned_at = v_now;

  return query select v_entry_id, v_participant_id, v_bib, v_first, v_last,
    v_class, v_sex, v_corrected, v_finish, v_station.station_order,
    v_local, v_elapsed, v_now;
end;
$function$;

revoke all on function public.cross_register_segmented_scan_internal(text, text, text)
  from public, anon, authenticated;
grant execute on function public.cross_register_segmented_scan_internal(text, text, text)
  to service_role;

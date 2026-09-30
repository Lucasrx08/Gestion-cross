-- Durcissement issu de l’audit du 30/09/2026.
-- Objectifs : synchronisation réconciliée, départ/postes atomiques,
-- clôture réellement verrouillée et corrections de classement transactionnelles.

alter table public.cross_participants
  add column if not exists is_active boolean not null default true;

alter table public.cross_heats
  add column if not exists station_code_plain text;

alter table public.cross_heats
  drop constraint if exists cross_heats_station_code_plain_check;
alter table public.cross_heats
  add constraint cross_heats_station_code_plain_check
  check (station_code_plain is null or station_code_plain ~ '^[0-9]{6}$');

create index if not exists cross_participants_event_active_idx
  on public.cross_participants(event_id, is_active);

-- Synchronise la liste locale sans casser l’historique d’une course déjà lancée.
-- L’identifiant de dossard est utilisé comme identité de secours lorsque l’ID local a changé.
create or replace function public.cross_sync_participants_internal(
  p_event_id uuid,
  p_owner_key_hash text,
  p_participants jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_item jsonb;
  v_local text;
  v_bib text;
  v_number integer;
  v_last text;
  v_first text;
  v_class text;
  v_sex text;
  v_existing public.cross_participants%rowtype;
  v_seen integer := 0;
  v_deleted integer := 0;
  v_archived integer := 0;
begin
  perform 1 from public.cross_events e
    where e.id = p_event_id and e.owner_key_hash = p_owner_key_hash
    for update;
  if not found then raise exception 'EVENEMENT_INTROUVABLE'; end if;
  if jsonb_typeof(p_participants) <> 'array' then raise exception 'LISTE_PARTICIPANTS_INVALIDE'; end if;

  if exists (
    select 1
    from jsonb_array_elements(p_participants) x
    group by upper(trim(x->>'bib_code'))
    having count(*) > 1
  ) then raise exception 'DOSSARDS_DUPLIQUES'; end if;

  if exists (
    select 1
    from jsonb_array_elements(p_participants) x
    group by trim(x->>'local_participant_id')
    having count(*) > 1
  ) then raise exception 'IDENTIFIANTS_DUPLIQUES'; end if;

  -- On archive d’abord tout le monde ; chaque ligne reçue est ensuite réactivée.
  update public.cross_participants set is_active = false, updated_at = now()
    where event_id = p_event_id;

  for v_item in select value from jsonb_array_elements(p_participants)
  loop
    v_local := left(trim(coalesce(v_item->>'local_participant_id','')), 120);
    v_bib := left(upper(trim(coalesce(v_item->>'bib_code',''))), 40);
    v_number := greatest(0, coalesce(nullif(v_item->>'bib_number','')::integer, 0));
    v_last := left(trim(coalesce(v_item->>'last_name','')), 160);
    v_first := left(trim(coalesce(v_item->>'first_name','')), 160);
    v_class := left(trim(coalesce(v_item->>'class_name','')), 160);
    v_sex := left(trim(coalesce(v_item->>'sex','')), 40);
    if v_local = '' or v_bib = '' then raise exception 'PARTICIPANT_INVALIDE'; end if;

    select * into v_existing
      from public.cross_participants p
      where p.event_id = p_event_id and p.local_participant_id = v_local
      for update;

    if not found then
      select * into v_existing
        from public.cross_participants p
        where p.event_id = p_event_id and p.bib_code = v_bib
        for update;
    end if;

    if found then
      -- Ne réattribue jamais silencieusement un dossard historique à une autre personne.
      if exists (
        select 1 from public.cross_entries ce
        join public.cross_heats h on h.id = ce.heat_id
        where ce.participant_id = v_existing.id and h.status in ('running','finished')
      ) and (
        lower(trim(v_existing.last_name)) <> lower(v_last)
        or lower(trim(v_existing.first_name)) <> lower(v_first)
      ) then
        raise exception 'DOSSARD_HISTORIQUE_CONFLIT';
      end if;

      update public.cross_participants set
        local_participant_id = v_local,
        bib_code = v_bib,
        bib_number = v_number,
        last_name = v_last,
        first_name = v_first,
        class_name = v_class,
        sex = v_sex,
        is_active = true,
        updated_at = now()
      where id = v_existing.id;
    else
      insert into public.cross_participants(
        event_id, local_participant_id, bib_code, bib_number,
        last_name, first_name, class_name, sex, is_active
      ) values (
        p_event_id, v_local, v_bib, v_number,
        v_last, v_first, v_class, v_sex, true
      );
    end if;
    v_seen := v_seen + 1;
  end loop;

  -- Les élèves absents du nouvel import et sans historique sont supprimés réellement.
  with deleted as (
    delete from public.cross_participants p
    where p.event_id = p_event_id
      and p.is_active = false
      and not exists (
        select 1 from public.cross_entries ce
        join public.cross_heats h on h.id = ce.heat_id
        where ce.participant_id = p.id and h.status in ('running','finished')
      )
    returning 1
  ) select count(*) into v_deleted from deleted;

  select count(*) into v_archived
    from public.cross_participants p
    where p.event_id = p_event_id and p.is_active = false;

  return jsonb_build_object(
    'participantCount', v_seen,
    'deletedCount', v_deleted,
    'archivedHistoricalCount', v_archived
  );
end;
$function$;

-- Une course ne peut démarrer qu’une seule fois. Un double clic / double appel
-- renvoie le même code et le même départ.
create or replace function public.cross_start_heat_internal(
  p_heat_id uuid,
  p_owner_key_hash text,
  p_station_code text,
  p_station_code_hash text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_heat public.cross_heats%rowtype;
begin
  select h.* into v_heat
  from public.cross_heats h
  join public.cross_events e on e.id = h.event_id
  where h.id = p_heat_id and e.owner_key_hash = p_owner_key_hash
  for update of h;
  if not found then raise exception 'COURSE_INTROUVABLE'; end if;
  if v_heat.status = 'finished' then raise exception 'COURSE_DEJA_TERMINEE'; end if;

  if v_heat.status = 'draft' then
    update public.cross_heats set
      status = 'running',
      station_code_hash = p_station_code_hash,
      station_code_plain = p_station_code,
      started_at = clock_timestamp(),
      finished_at = null,
      next_position = 0,
      updated_at = now()
    where id = p_heat_id
    returning * into v_heat;
  else
    -- Compatibilité des courses démarrées avant cette migration.
    if v_heat.station_code_plain is null then
      update public.cross_heats set
        station_code_hash = p_station_code_hash,
        station_code_plain = p_station_code,
        updated_at = now()
      where id = p_heat_id
      returning * into v_heat;
    end if;
  end if;

  return jsonb_build_object('heat', to_jsonb(v_heat), 'stationCode', v_heat.station_code_plain);
end;
$function$;

-- Affectation des postes sous verrou de course : aucun conflit lors de connexions simultanées.
create or replace function public.cross_join_station_internal(
  p_station_code_hash text,
  p_client_station_id text,
  p_mode text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_heat public.cross_heats%rowtype;
  v_station public.cross_stations%rowtype;
  v_order integer;
begin
  select * into v_heat from public.cross_heats
    where station_code_hash = p_station_code_hash
    for update;
  if not found then raise exception 'CODE_INVALIDE'; end if;
  if v_heat.status <> 'running' then raise exception 'COURSE_NON_DEMARREE'; end if;
  if p_mode not in ('start','continue') then raise exception 'POSTE_INVALIDE'; end if;

  select * into v_station from public.cross_stations
    where heat_id = v_heat.id and client_station_id = p_client_station_id;
  if found then return to_jsonb(v_station); end if;

  if p_mode = 'start' then
    if exists (select 1 from public.cross_stations where heat_id = v_heat.id and station_order = 1)
      then raise exception 'POSTE_DEBUT_DEJA_PRIS'; end if;
    v_order := 1;
  else
    if not exists (select 1 from public.cross_stations where heat_id = v_heat.id and station_order = 1)
      then raise exception 'POSTE_DEBUT_REQUIS'; end if;
    select min(candidate) into v_order
    from generate_series(2,4) candidate
    where not exists (
      select 1 from public.cross_stations s
      where s.heat_id = v_heat.id and s.station_order = candidate
    );
    if v_order is null then raise exception 'MAX_POSTES_ATTEINT'; end if;
  end if;

  insert into public.cross_stations(heat_id, client_station_id, station_order, mode, status)
  values(v_heat.id, p_client_station_id, v_order, p_mode, 'active')
  returning * into v_station;
  return to_jsonb(v_station);
end;
$function$;

-- Clôture atomique : tous les "à courir" deviennent non-finisseurs et les postes sont fermés.
create or replace function public.cross_finish_heat_internal(
  p_heat_id uuid,
  p_owner_key_hash text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_heat public.cross_heats%rowtype;
begin
  select h.* into v_heat
  from public.cross_heats h
  join public.cross_events e on e.id = h.event_id
  where h.id = p_heat_id and e.owner_key_hash = p_owner_key_hash
  for update of h;
  if not found then raise exception 'COURSE_INTROUVABLE'; end if;
  if v_heat.status = 'draft' then raise exception 'COURSE_NON_DEMARREE'; end if;
  if v_heat.status = 'finished' then return jsonb_build_object('finished', true); end if;

  update public.cross_entries set status = 'dnf', updated_at = now()
    where heat_id = p_heat_id and status = 'registered';
  update public.cross_stations set status = 'closed', updated_at = now()
    where heat_id = p_heat_id;
  update public.cross_heats set status = 'finished', finished_at = clock_timestamp(), updated_at = now()
    where id = p_heat_id;
  return jsonb_build_object('finished', true);
end;
$function$;

-- Annulation autorisée uniquement pendant la course.
create or replace function public.cross_undo_last_scan_internal(
  p_station_code_hash text,
  p_client_station_id text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_heat public.cross_heats%rowtype;
  v_station public.cross_stations%rowtype;
  v_entry uuid;
begin
  select * into v_heat from public.cross_heats
    where station_code_hash = p_station_code_hash
    for update;
  if not found then raise exception 'CODE_INVALIDE'; end if;
  if v_heat.status <> 'running' then raise exception 'COURSE_TERMINEE_VERROUILLEE'; end if;

  select * into v_station from public.cross_stations
    where heat_id = v_heat.id and client_station_id = p_client_station_id and status = 'active';
  if not found then raise exception 'POSTE_NON_ENREGISTRE'; end if;

  select id into v_entry from public.cross_entries
    where heat_id = v_heat.id and status = 'finished' and station_order = v_station.station_order
    order by station_position desc limit 1;
  if v_entry is null then raise exception 'AUCUNE_ARRIVEE_A_ANNULER'; end if;

  delete from public.cross_scans where entry_id = v_entry;
  update public.cross_entries set
    status = 'registered', finish_position = null, station_order = null,
    station_position = null, elapsed_ms = null, scanned_at = null,
    station_id = null, updated_at = now()
  where id = v_entry;
  perform public.cross_recompute_segmented_positions(v_heat.id);
  return jsonb_build_object('removed', true);
end;
$function$;

-- Correction du classement final et du journal de scans dans la même transaction.
create or replace function public.cross_reorder_finish_internal(
  p_entry_id uuid,
  p_owner_key_hash text,
  p_target integer
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_heat_id uuid;
  v_current integer;
  v_count integer;
  v_target integer;
begin
  select ce.heat_id, ce.finish_position into v_heat_id, v_current
  from public.cross_entries ce
  join public.cross_heats h on h.id = ce.heat_id
  join public.cross_events ev on ev.id = h.event_id
  where ce.id = p_entry_id
    and ce.status = 'finished'
    and h.status = 'finished'
    and ev.owner_key_hash = p_owner_key_hash;
  if not found or v_current is null then raise exception 'ARRIVEE_INTROUVABLE'; end if;

  perform 1 from public.cross_heats where id = v_heat_id for update;
  select count(*) into v_count from public.cross_entries
    where heat_id = v_heat_id and status = 'finished';
  v_target := greatest(1, least(p_target, v_count));
  if v_target = v_current then return jsonb_build_object('reordered', true); end if;

  set constraints cross_entries_heat_position_key, cross_scans_heat_position_key deferred;

  update public.cross_entries ce set finish_position = case
    when ce.id = p_entry_id then v_target
    when v_target < v_current and ce.finish_position >= v_target and ce.finish_position < v_current then ce.finish_position + 1
    when v_target > v_current and ce.finish_position > v_current and ce.finish_position <= v_target then ce.finish_position - 1
    else ce.finish_position
  end,
  updated_at = now()
  where ce.heat_id = v_heat_id and ce.status = 'finished';

  update public.cross_scans s set position = ce.finish_position
    from public.cross_entries ce
    where s.entry_id = ce.id and ce.heat_id = v_heat_id and ce.status = 'finished';

  return jsonb_build_object('reordered', true, 'position', v_target);
end;
$function$;

-- La préparation d’une course ne sélectionne que les élèves de la liste active.
create or replace function public.cross_save_heat_plan_internal(
  p_event_id uuid, p_owner_key_hash text, p_heat_id uuid, p_name text,
  p_selected_classes text[], p_sex_filter text, p_challenge_enabled boolean,
  p_challenge_classes text[], p_participant_ids text[], p_scheduled_time time without time zone
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_heat public.cross_heats%rowtype;
  v_ids uuid[];
begin
  if not exists (select 1 from public.cross_events e where e.id = p_event_id and e.owner_key_hash = p_owner_key_hash)
    then raise exception 'EVENEMENT_INTROUVABLE'; end if;
  if length(trim(p_name)) = 0 or length(trim(p_name)) > 160 then raise exception 'NOM_COURSE_REQUIS'; end if;
  if p_sex_filter not in ('all','female','male') then raise exception 'FILTRE_INVALIDE'; end if;
  select array_agg(p.id) into v_ids from public.cross_participants p
    where p.event_id = p_event_id and p.is_active = true
      and p.local_participant_id = any(p_participant_ids);
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

revoke all on function public.cross_sync_participants_internal(uuid,text,jsonb) from public, anon, authenticated;
revoke all on function public.cross_start_heat_internal(uuid,text,text,text) from public, anon, authenticated;
revoke all on function public.cross_join_station_internal(text,text,text) from public, anon, authenticated;
revoke all on function public.cross_finish_heat_internal(uuid,text) from public, anon, authenticated;
revoke all on function public.cross_undo_last_scan_internal(text,text) from public, anon, authenticated;
revoke all on function public.cross_reorder_finish_internal(uuid,text,integer) from public, anon, authenticated;

grant execute on function public.cross_sync_participants_internal(uuid,text,jsonb) to service_role;
grant execute on function public.cross_start_heat_internal(uuid,text,text,text) to service_role;
grant execute on function public.cross_join_station_internal(text,text,text) to service_role;
grant execute on function public.cross_finish_heat_internal(uuid,text) to service_role;
grant execute on function public.cross_undo_last_scan_internal(text,text) to service_role;
grant execute on function public.cross_reorder_finish_internal(uuid,text,integer) to service_role;

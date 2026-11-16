begin;

create unique index if not exists bookings_seat_number_unique
  on public.bookings (seat_number);

alter table public.settings
  add column if not exists seat_access_starts_at timestamptz,
  add column if not exists seat_access_ends_at timestamptz;

alter table public.settings
  drop constraint if exists settings_seat_access_window_order,
  add constraint settings_seat_access_window_order check (
    seat_access_starts_at is null
    or seat_access_ends_at is null
    or seat_access_starts_at < seat_access_ends_at
  );

create or replace function public.student_booking_seat(
  p_name text,
  p_school text,
  p_grade text,
  p_teacher text,
  p_gender text,
  p_new_seat integer default null,
  p_expected_seat integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking_id public.bookings.id%type;
  v_seat integer;
  v_gender text;
  v_occupied integer[];
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_now timestamptz;
begin
  begin
    select b.id, b.seat_number, b.gender
      into strict v_booking_id, v_seat, v_gender
    from public.bookings b
    where btrim(b.name) = btrim(p_name)
      and btrim(p_name) <> ''
      and b.school = p_school
      and b.grade = p_grade
      and b.teacher = p_teacher
      and b.gender = p_gender
      and p_gender in ('여', '남')
    for update;
  exception
    when no_data_found then
      return jsonb_build_object('status', 'no_match');
    when too_many_rows then
      return jsonb_build_object('status', 'multiple_matches');
  end;

  select s.seat_access_starts_at, s.seat_access_ends_at
    into v_starts_at, v_ends_at
  from public.settings s
  where s.id = 1;

  v_now := clock_timestamp();
  if v_starts_at is not null and v_now < v_starts_at then
    return jsonb_build_object('status', 'not_open', 'limit_time', v_starts_at);
  end if;
  if v_ends_at is not null and v_now >= v_ends_at then
    return jsonb_build_object('status', 'closed', 'limit_time', v_ends_at);
  end if;

  if p_new_seat is not null then
    if p_expected_seat is distinct from v_seat then
      return jsonb_build_object('status', 'seat_changed');
    end if;

    if ((v_gender = '여' and p_new_seat between 1 and 23)
        or (v_gender = '남' and p_new_seat between 24 and 48)) is not true then
      return jsonb_build_object('status', 'invalid_seat');
    end if;

    begin
      update public.bookings
      set seat_number = p_new_seat
      where id = v_booking_id;
    exception when unique_violation then
      return jsonb_build_object('status', 'seat_taken');
    end;
    v_seat := p_new_seat;
  end if;

  select coalesce(array_agg(b.seat_number::integer), '{}'::integer[])
    into v_occupied
  from public.bookings b
  where b.seat_number is not null;

  return jsonb_build_object(
    'status', 'ok', 'seat_number', v_seat, 'gender', v_gender, 'occupied', v_occupied
  );
end;
$$;

revoke all on function public.student_booking_seat(text, text, text, text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.student_booking_seat(text, text, text, text, text, integer, integer)
  to anon, authenticated;

notify pgrst, 'reload schema';
commit;

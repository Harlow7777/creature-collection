-- ============================================================
-- MONSTRUM — Complete Schema + Seed
-- Run this entire file in Supabase → SQL Editor → New Query
-- ============================================================


-- ── EXTENSIONS ────────────────────────────────────────────
create extension if not exists "pgcrypto";


-- ── DROP EXISTING TABLES (safe re-run) ────────────────────
drop table if exists battles cascade;
drop table if exists user_appearance_items cascade;
drop table if exists user_modifiers cascade;
drop table if exists user_pets cascade;
drop table if exists user_creatures cascade;
drop table if exists appearance_items cascade;
drop table if exists modifiers cascade;
drop table if exists pets cascade;
drop table if exists creatures cascade;
drop table if exists profiles cascade;

-- Drop old trigger/function if exists
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists handle_new_user;


-- ── PROFILES ──────────────────────────────────────────────
create table profiles (
  id                uuid references auth.users on delete cascade primary key,
  username          text unique,
  currency          integer not null default 100,
  premium_currency  integer not null default 10,
  rolls_today       integer not null default 10,
  wins              integer not null default 0,
  total_rolls       integer not null default 0,
  last_roll_date    date,
  created_at        timestamptz default now()
);

-- Auto-create profile on signup
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();


-- ── CREATURES ─────────────────────────────────────────────
create table creatures (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  type            text not null,
  rarity          text not null check (rarity in ('common','uncommon','rare','legendary')),
  base_hp         integer not null,
  base_atk        integer not null,
  base_def        integer not null,
  base_spd        integer not null,
  evolution_stage integer not null default 1,
  evolves_from    uuid references creatures(id),
  evolves_at_xp   integer,
  sprite_url      text,
  created_at      timestamptz default now()
);


-- ── USER CREATURES ────────────────────────────────────────
create table user_creatures (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references profiles(id) on delete cascade,
  creature_id      uuid not null references creatures(id),
  nickname         text,
  level            integer not null default 1,
  xp               integer not null default 0,
  hp               integer,
  atk              integer,
  def              integer,
  spd              integer,
  is_displayed     boolean not null default false,
  display_order    integer check (display_order in (1,2,3)),
  skin_id          uuid,
  created_at       timestamptz default now()
);


-- ── PETS ──────────────────────────────────────────────────
create table pets (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  rarity      text not null check (rarity in ('common','uncommon','rare','legendary')),
  bonus_type  text not null,
  bonus_value numeric not null,
  sprite_url  text,
  created_at  timestamptz default now()
);


-- ── USER PETS ─────────────────────────────────────────────
create table user_pets (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles(id) on delete cascade,
  pet_id        uuid not null references pets(id),
  assigned_to   uuid references user_creatures(id) on delete set null,
  acquired_at   timestamptz default now()
);


-- ── MODIFIERS ─────────────────────────────────────────────
create table modifiers (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  description    text,
  effect_type    text not null,
  effect_value   text not null,
  duration_rolls integer not null default 1,
  cost           integer not null,
  currency_type  text not null check (currency_type in ('soft','premium')),
  created_at     timestamptz default now()
);


-- ── USER MODIFIERS ────────────────────────────────────────
create table user_modifiers (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references profiles(id) on delete cascade,
  modifier_id     uuid not null references modifiers(id),
  rolls_remaining integer not null,
  acquired_at     timestamptz default now()
);


-- ── APPEARANCE ITEMS ──────────────────────────────────────
create table appearance_items (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  type          text not null check (type in ('skin','frame','effect')),
  target_type   text,
  preview_url   text,
  cost          integer not null,
  currency_type text not null check (currency_type in ('soft','premium')),
  created_at    timestamptz default now()
);


-- ── USER APPEARANCE ITEMS ─────────────────────────────────
create table user_appearance_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  item_id     uuid not null references appearance_items(id),
  acquired_at timestamptz default now()
);


-- ── BATTLES ───────────────────────────────────────────────
create table battles (
  id            uuid primary key default gen_random_uuid(),
  challenger_id uuid not null references profiles(id),
  opponent_id   uuid references profiles(id),
  winner_id     uuid references profiles(id),
  log           jsonb,
  created_at    timestamptz default now()
);


-- ── ROW LEVEL SECURITY ────────────────────────────────────
alter table profiles          enable row level security;
alter table user_creatures    enable row level security;
alter table user_pets         enable row level security;
alter table user_modifiers    enable row level security;
alter table user_appearance_items enable row level security;
alter table battles           enable row level security;
-- Public tables (no RLS needed for reads)
alter table creatures         enable row level security;
alter table pets              enable row level security;
alter table modifiers         enable row level security;
alter table appearance_items  enable row level security;

-- Profiles
create policy "profiles_select_own" on profiles for select using (auth.uid() = id);
create policy "profiles_update_own" on profiles for update using (auth.uid() = id);
create policy "profiles_insert_own" on profiles for insert with check (auth.uid() = id);
create policy "profiles_select_own" on profiles for select using (auth.uid() = id);
create policy "profiles_update_own" on profiles for update using (auth.uid() = id);

-- User creatures
create policy "uc_select_own" on user_creatures for select using (auth.uid() = user_id);
create policy "uc_insert_own" on user_creatures for insert with check (auth.uid() = user_id);
create policy "uc_update_own" on user_creatures for update using (auth.uid() = user_id);
create policy "uc_delete_own" on user_creatures for delete using (auth.uid() = user_id);

-- User pets
create policy "up_select_own" on user_pets for select using (auth.uid() = user_id);
create policy "up_insert_own" on user_pets for insert with check (auth.uid() = user_id);
create policy "up_update_own" on user_pets for update using (auth.uid() = user_id);
create policy "up_delete_own" on user_pets for delete using (auth.uid() = user_id);

-- User modifiers
create policy "um_select_own" on user_modifiers for select using (auth.uid() = user_id);
create policy "um_insert_own" on user_modifiers for insert with check (auth.uid() = user_id);
create policy "um_update_own" on user_modifiers for update using (auth.uid() = user_id);
create policy "um_delete_own" on user_modifiers for delete using (auth.uid() = user_id);

-- User appearance items
create policy "uai_select_own" on user_appearance_items for select using (auth.uid() = user_id);
create policy "uai_insert_own" on user_appearance_items for insert with check (auth.uid() = user_id);

-- Battles
create policy "battles_select_own" on battles for select using (auth.uid() = challenger_id or auth.uid() = opponent_id);
create policy "battles_insert_own" on battles for insert with check (auth.uid() = challenger_id);

-- Public read on master tables
create policy "creatures_public_read"        on creatures        for select using (true);
create policy "pets_public_read"             on pets             for select using (true);
create policy "modifiers_public_read"        on modifiers        for select using (true);
create policy "appearance_items_public_read" on appearance_items for select using (true);


-- ============================================================
-- SEED DATA
-- ============================================================


-- ── CREATURES: Stage 1 base forms ────────────────────────

-- Common creatures
insert into creatures (id, name, type, rarity, base_hp, base_atk, base_def, base_spd, evolution_stage, evolves_at_xp, sprite_url) values
('11111111-0000-0000-0000-000000000001', 'Puffmoss',  'Nature',   'common',  70,  40, 55, 60, 1, 100, '🐸');

insert into creatures (id, name, type, rarity, base_hp, base_atk, base_def, base_spd, evolution_stage, evolves_at_xp, sprite_url) values
('11111111-0000-0000-0000-000000000002', 'Stoneback', 'Earth',    'common', 120,  45, 95, 30, 1, 100, '🐢');

insert into creatures (id, name, type, rarity, base_hp, base_atk, base_def, base_spd, evolution_stage, evolves_at_xp, sprite_url) values
('11111111-0000-0000-0000-000000000003', 'Cinderpup', 'Fire',     'common',  75,  55, 40, 70, 1, 100, '🐶');

insert into creatures (id, name, type, rarity, base_hp, base_atk, base_def, base_spd, evolution_stage, evolves_at_xp, sprite_url) values
('11111111-0000-0000-0000-000000000004', 'Ripplefin', 'Water',    'common',  80,  42, 65, 55, 1, 100, '🐟');

insert into creatures (id, name, type, rarity, base_hp, base_atk, base_def, base_spd, evolution_stage, evolves_at_xp, sprite_url) values
('11111111-0000-0000-0000-000000000005', 'Zappchick', 'Electric', 'common',  65,  58, 35, 80, 1, 100, '🐥');

insert into creatures (id, name, type, rarity, base_hp, base_atk, base_def, base_spd, evolution_stage, evolves_at_xp, sprite_url) values
('11111111-0000-0000-0000-000000000006', 'Dustmite',  'Earth',    'common',  85,  38, 70, 45, 1, 100, '🦗');

insert into creatures (id, name, type, rarity, base_hp, base_atk, base_def, base_spd, evolution_stage, evolves_at_xp, sprite_url) values
('11111111-0000-0000-0000-000000000007', 'Frostbud',  'Ice',      'common',  72,  44, 60, 58, 1, 100, '🌸');

insert into creatures (id, name, type, rarity, base_hp, base_atk, base_def, base_spd, evolution_stage, evolves_at_xp, sprite_url) values
('11111111-0000-0000-0000-000000000008', 'Glimwing',  'Nature',   'common',  68,  48, 45, 75, 1, 100, '🦋');

-- Uncommon creatures
insert into creatures (id, name, type, rarity, base_hp, base_atk, base_def, base_spd, evolution_stage, evolves_at_xp, sprite_url) values
('22222222-0000-0000-0000-000000000001', 'Tideclaw',   'Water',    'uncommon',  80, 60, 70, 65, 1, 150, '🦞');

insert into creatures (id, name, type, rarity, base_hp, base_atk, base_def, base_spd, evolution_stage, evolves_at_xp, sprite_url) values
('22222222-0000-0000-0000-000000000002', 'Voltmane',   'Electric', 'uncommon',  85, 80, 45, 95, 1, 150, '🦁');

insert into creatures (id, name, type, rarity, base_hp, base_atk, base_def, base_spd, evolution_stage, evolves_at_xp, sprite_url) values
('22222222-0000-0000-0000-000000000003', 'Thornback',  'Nature',   'uncommon',  95, 65, 80, 50, 1, 150, '🦔');

insert into creatures (id, name, type, rarity, base_hp, base_atk, base_def, base_spd, evolution_stage, evolves_at_xp, sprite_url) values
('22222222-0000-0000-0000-000000000004', 'Ashcrow',    'Fire',     'uncommon',  78, 72, 48, 82, 1, 150, '🪶');

insert into creatures (id, name, type, rarity, base_hp, base_atk, base_def, base_spd, evolution_stage, evolves_at_xp, sprite_url) values
('22222222-0000-0000-0000-000000000005', 'Boulderkin', 'Earth',    'uncommon', 110, 55, 90, 35, 1, 150, '🪨');

insert into creatures (id, name, type, rarity, base_hp, base_atk, base_def, base_spd, evolution_stage, evolves_at_xp, sprite_url) values
('22222222-0000-0000-0000-000000000006', 'Mistshade',  'Shadow',   'uncommon',  74, 78, 52, 88, 1, 150, '🦇');

insert into creatures (id, name, type, rarity, base_hp, base_atk, base_def, base_spd, evolution_stage, evolves_at_xp, sprite_url) values
('22222222-0000-0000-0000-000000000007', 'Coralhorn',  'Water',    'uncommon',  88, 58, 75, 60, 1, 150, '🐚');

insert into creatures (id, name, type, rarity, base_hp, base_atk, base_def, base_spd, evolution_stage, evolves_at_xp, sprite_url) values
('22222222-0000-0000-0000-000000000008', 'Glacepaw',   'Ice',      'uncommon',  82, 62, 78, 62, 1, 150, '🐾');

-- Rare creatures
insert into creatures (id, name, type, rarity, base_hp, base_atk, base_def, base_spd, evolution_stage, evolves_at_xp, sprite_url) values
('33333333-0000-0000-0000-000000000001', 'Emberwing',  'Fire',   'rare',  90, 75,  50, 85, 1, 200, '🦅');

insert into creatures (id, name, type, rarity, base_hp, base_atk, base_def, base_spd, evolution_stage, evolves_at_xp, sprite_url) values
('33333333-0000-0000-0000-000000000002', 'Crystalix',  'Ice',    'rare',  75, 70,  80, 70, 1, 200, '🦊');

insert into creatures (id, name, type, rarity, base_hp, base_atk, base_def, base_spd, evolution_stage, evolves_at_xp, sprite_url) values
('33333333-0000-0000-0000-000000000003', 'Venomfang',  'Nature', 'rare',  85, 88,  55, 80, 1, 200, '🐍');

insert into creatures (id, name, type, rarity, base_hp, base_atk, base_def, base_spd, evolution_stage, evolves_at_xp, sprite_url) values
('33333333-0000-0000-0000-000000000004', 'Stormtalon', 'Electric','rare', 80, 85,  50, 95, 1, 200, '🦅');

insert into creatures (id, name, type, rarity, base_hp, base_atk, base_def, base_spd, evolution_stage, evolves_at_xp, sprite_url) values
('33333333-0000-0000-0000-000000000005', 'Ironhide',   'Earth',  'rare', 115, 60, 100, 40, 1, 200, '🦏');

insert into creatures (id, name, type, rarity, base_hp, base_atk, base_def, base_spd, evolution_stage, evolves_at_xp, sprite_url) values
('33333333-0000-0000-0000-000000000006', 'Tidewraith', 'Water',  'rare',  88, 80,  70, 75, 1, 200, '🐙');

insert into creatures (id, name, type, rarity, base_hp, base_atk, base_def, base_spd, evolution_stage, evolves_at_xp, sprite_url) values
('33333333-0000-0000-0000-000000000007', 'Cinderscale','Fire',   'rare',  95, 82,  58, 78, 1, 200, '🦎');

insert into creatures (id, name, type, rarity, base_hp, base_atk, base_def, base_spd, evolution_stage, evolves_at_xp, sprite_url) values
('33333333-0000-0000-0000-000000000008', 'Nightblade', 'Shadow', 'rare',  78, 92,  55, 92, 1, 200, '🐱');

-- Legendary creatures
insert into creatures (id, name, type, rarity, base_hp, base_atk, base_def, base_spd, evolution_stage, evolves_at_xp, sprite_url) values
('44444444-0000-0000-0000-000000000001', 'Gloomfang',  'Shadow',   'legendary', 100,  95,  60,  90, 1, 500, '🐺');

insert into creatures (id, name, type, rarity, base_hp, base_atk, base_def, base_spd, evolution_stage, evolves_at_xp, sprite_url) values
('44444444-0000-0000-0000-000000000002', 'Duskwyrm',   'Shadow',   'legendary', 130, 100,  75,  80, 1, 500, '🐉');

insert into creatures (id, name, type, rarity, base_hp, base_atk, base_def, base_spd, evolution_stage, evolves_at_xp, sprite_url) values
('44444444-0000-0000-0000-000000000003', 'Solarius',   'Fire',     'legendary', 110,  98,  65,  95, 1, 500, '🦁');

insert into creatures (id, name, type, rarity, base_hp, base_atk, base_def, base_spd, evolution_stage, evolves_at_xp, sprite_url) values
('44444444-0000-0000-0000-000000000004', 'Abyssalord', 'Water',    'legendary', 125,  92,  80,  85, 1, 500, '🐋');

insert into creatures (id, name, type, rarity, base_hp, base_atk, base_def, base_spd, evolution_stage, evolves_at_xp, sprite_url) values
('44444444-0000-0000-0000-000000000005', 'Terracolos', 'Earth',    'legendary', 150,  85, 110,  55, 1, 500, '🦕');

insert into creatures (id, name, type, rarity, base_hp, base_atk, base_def, base_spd, evolution_stage, evolves_at_xp, sprite_url) values
('44444444-0000-0000-0000-000000000006', 'Voltempest', 'Electric', 'legendary', 105, 105,  60, 105, 1, 500, '🌩️');

insert into creatures (id, name, type, rarity, base_hp, base_atk, base_def, base_spd, evolution_stage, evolves_at_xp, sprite_url) values
('44444444-0000-0000-0000-000000000007', 'Glacierend', 'Ice',      'legendary', 120,  90,  95,  75, 1, 500, '🐻');

insert into creatures (id, name, type, rarity, base_hp, base_atk, base_def, base_spd, evolution_stage, evolves_at_xp, sprite_url) values
('44444444-0000-0000-0000-000000000008', 'Verdanthos', 'Nature',   'legendary', 115,  88,  85,  88, 1, 500, '🌿');


-- ── CREATURES: Stage 2 evolutions ─────────────────────────
-- (inserted separately so evolves_from FK resolves correctly)

insert into creatures (id, name, type, rarity, base_hp, base_atk, base_def, base_spd, evolution_stage, evolves_from, evolves_at_xp, sprite_url) values
('11111111-0001-0000-0000-000000000001', 'Bloomoss',    'Nature',   'uncommon', 100, 65,  75, 80, 2, '11111111-0000-0000-0000-000000000001', 300, '🐊');

insert into creatures (id, name, type, rarity, base_hp, base_atk, base_def, base_spd, evolution_stage, evolves_from, evolves_at_xp, sprite_url) values
('11111111-0001-0000-0000-000000000002', 'Gravelshell', 'Earth',    'uncommon', 155, 68, 120, 40, 2, '11111111-0000-0000-0000-000000000002', 300, '🦖');

insert into creatures (id, name, type, rarity, base_hp, base_atk, base_def, base_spd, evolution_stage, evolves_from, evolves_at_xp, sprite_url) values
('11111111-0001-0000-0000-000000000003', 'Infernhound', 'Fire',     'uncommon', 105, 80,  58, 90, 2, '11111111-0000-0000-0000-000000000003', 300, '🐕');

insert into creatures (id, name, type, rarity, base_hp, base_atk, base_def, base_spd, evolution_stage, evolves_from, evolves_at_xp, sprite_url) values
('11111111-0001-0000-0000-000000000004', 'Wavecrest',   'Water',    'uncommon', 110, 65,  88, 72, 2, '11111111-0000-0000-0000-000000000004', 300, '🐬');

insert into creatures (id, name, type, rarity, base_hp, base_atk, base_def, base_spd, evolution_stage, evolves_from, evolves_at_xp, sprite_url) values
('22222222-0001-0000-0000-000000000001', 'Abyssalclaw', 'Water',    'rare',     115, 90, 100, 85, 2, '22222222-0000-0000-0000-000000000001', 400, '🦑');

insert into creatures (id, name, type, rarity, base_hp, base_atk, base_def, base_spd, evolution_stage, evolves_from, evolves_at_xp, sprite_url) values
('22222222-0001-0000-0000-000000000002', 'Thundermane', 'Electric', 'rare',     115, 110,  65, 115, 2, '22222222-0000-0000-0000-000000000002', 400, '🦁');

insert into creatures (id, name, type, rarity, base_hp, base_atk, base_def, base_spd, evolution_stage, evolves_from, evolves_at_xp, sprite_url) values
('33333333-0001-0000-0000-000000000001', 'Pyrophoenix', 'Fire',     'legendary', 140, 115,  75, 115, 2, '33333333-0000-0000-0000-000000000001', 600, '🔥');

insert into creatures (id, name, type, rarity, base_hp, base_atk, base_def, base_spd, evolution_stage, evolves_from, evolves_at_xp, sprite_url) values
('33333333-0001-0000-0000-000000000002', 'Frostgoddess', 'Ice',     'legendary', 120, 105, 125,  95, 2, '33333333-0000-0000-0000-000000000002', 600, '🌨️');


-- ── PETS ──────────────────────────────────────────────────
insert into pets (id, name, rarity, bonus_type, bonus_value, sprite_url) values
('aaaaaaaa-0000-0000-0000-000000000001', 'Spirit Kitten', 'uncommon', 'xp_boost',  0.10, '🐱');

insert into pets (id, name, rarity, bonus_type, bonus_value, sprite_url) values
('aaaaaaaa-0000-0000-0000-000000000002', 'Shadow Pup',    'rare',     'atk_boost', 0.08, '🐺');

insert into pets (id, name, rarity, bonus_type, bonus_value, sprite_url) values
('aaaaaaaa-0000-0000-0000-000000000003', 'Lunar Moth',    'rare',     'def_boost', 0.12, '🦋');

insert into pets (id, name, rarity, bonus_type, bonus_value, sprite_url) values
('aaaaaaaa-0000-0000-0000-000000000004', 'Storm Sprite',  'uncommon', 'spd_boost', 0.10, '⚡');

insert into pets (id, name, rarity, bonus_type, bonus_value, sprite_url) values
('aaaaaaaa-0000-0000-0000-000000000005', 'Ember Drake',   'legendary','atk_boost', 0.20, '🔥');

insert into pets (id, name, rarity, bonus_type, bonus_value, sprite_url) values
('aaaaaaaa-0000-0000-0000-000000000006', 'Tidefish',      'common',   'hp_boost',  0.08, '🐠');

insert into pets (id, name, rarity, bonus_type, bonus_value, sprite_url) values
('aaaaaaaa-0000-0000-0000-000000000007', 'Crystal Wisp',  'rare',     'xp_boost',  0.15, '💎');

insert into pets (id, name, rarity, bonus_type, bonus_value, sprite_url) values
('aaaaaaaa-0000-0000-0000-000000000008', 'Rootling',      'common',   'def_boost', 0.06, '🌱');


-- ── MODIFIERS ─────────────────────────────────────────────
insert into modifiers (id, name, description, effect_type, effect_value, duration_rolls, cost, currency_type) values
('bbbbbbbb-0000-0000-0000-000000000001', 'Rare Focus',        'Doubles rare chance for 5 rolls',       'boost_rarity', 'rare',      5, 200, 'soft');

insert into modifiers (id, name, description, effect_type, effect_value, duration_rolls, cost, currency_type) values
('bbbbbbbb-0000-0000-0000-000000000002', 'Legendary Aura',    'Adds 5% legendary chance for 3 rolls',  'boost_rarity', 'legendary', 3,  50, 'premium');

insert into modifiers (id, name, description, effect_type, effect_value, duration_rolls, cost, currency_type) values
('bbbbbbbb-0000-0000-0000-000000000003', 'Type Lens: Fire',   'Next roll guaranteed Fire type',         'boost_type',   'Fire',      1, 150, 'soft');

insert into modifiers (id, name, description, effect_type, effect_value, duration_rolls, cost, currency_type) values
('bbbbbbbb-0000-0000-0000-000000000004', 'Type Lens: Water',  'Next roll guaranteed Water type',        'boost_type',   'Water',     1, 150, 'soft');

insert into modifiers (id, name, description, effect_type, effect_value, duration_rolls, cost, currency_type) values
('bbbbbbbb-0000-0000-0000-000000000005', 'Type Lens: Shadow', 'Next roll guaranteed Shadow type',       'boost_type',   'Shadow',    1, 200, 'soft');

insert into modifiers (id, name, description, effect_type, effect_value, duration_rolls, cost, currency_type) values
('bbbbbbbb-0000-0000-0000-000000000006', 'Golden Lens',       'Guaranteed uncommon or better',          'boost_rarity', 'uncommon',  3, 100, 'soft');

insert into modifiers (id, name, description, effect_type, effect_value, duration_rolls, cost, currency_type) values
('bbbbbbbb-0000-0000-0000-000000000007', 'Prisma Lens',       'Equal chance for all rarities',          'equalize',     'all',       5,  25, 'premium');


-- ── APPEARANCE ITEMS ──────────────────────────────────────
insert into appearance_items (id, name, type, preview_url, cost, currency_type) values
('cccccccc-0000-0000-0000-000000000001', 'Golden Frame',   'frame',  '✨',  20, 'premium');

insert into appearance_items (id, name, type, preview_url, cost, currency_type) values
('cccccccc-0000-0000-0000-000000000002', 'Prismatic Skin', 'skin',   '🌈',  75, 'premium');

insert into appearance_items (id, name, type, preview_url, cost, currency_type) values
('cccccccc-0000-0000-0000-000000000003', 'Shadow Veil',    'effect', '🌑',  40, 'premium');

insert into appearance_items (id, name, type, preview_url, cost, currency_type) values
('cccccccc-0000-0000-0000-000000000004', 'Flame Aura',     'effect', '🔥', 500, 'soft');

insert into appearance_items (id, name, type, preview_url, cost, currency_type) values
('cccccccc-0000-0000-0000-000000000005', 'Ice Crystal',    'skin',   '❄️', 350, 'soft');

insert into appearance_items (id, name, type, preview_url, cost, currency_type) values
('cccccccc-0000-0000-0000-000000000006', 'Forest Crown',   'frame',  '🌿', 300, 'soft');


-- ── VERIFY ────────────────────────────────────────────────
select 'creatures' as tbl, count(*) as rows from creatures
union all
select 'pets',             count(*) from pets
union all
select 'modifiers',        count(*) from modifiers
union all
select 'appearance_items', count(*) from appearance_items;
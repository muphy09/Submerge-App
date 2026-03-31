alter table public.franchise_users
  add column if not exists dig_commission_rate double precision not null default 0.0275;

alter table public.franchise_users
  add column if not exists closeout_commission_rate double precision not null default 0.0275;

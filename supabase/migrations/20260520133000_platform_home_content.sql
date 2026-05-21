alter table public.platform_settings
add column if not exists home_content jsonb not null default '{}'::jsonb;
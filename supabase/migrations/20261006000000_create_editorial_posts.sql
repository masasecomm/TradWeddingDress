create table public.posts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 5 and 160),
  excerpt text not null check (char_length(excerpt) between 20 and 500),
  body text not null check (char_length(body) between 100 and 12000),
  category text not null default 'Bridal style' check (char_length(category) <= 80),
  featured_image_url text not null,
  image_alt text not null check (char_length(image_alt) between 5 and 250),
  source_url text not null,
  image_rights_confirmed boolean not null default false check (image_rights_confirmed),
  trend_queries text[] not null default '{}',
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_at timestamptz not null default now(),
  published_at timestamptz
);

create index posts_published_created_at_idx
  on public.posts (published_at desc)
  where status = 'published';

alter table public.posts enable row level security;
grant select on public.posts to anon;
grant select, insert, update, delete on public.posts to authenticated;

create policy "Published stories are visible to everyone"
  on public.posts for select
  using (status = 'published');

create policy "Editors can read their own stories"
  on public.posts for select to authenticated
  using (auth.uid() = owner_id);

create policy "Editors can create their own drafts"
  on public.posts for insert to authenticated
  with check (auth.uid() = owner_id and status = 'draft');

create policy "Editors can update their own stories"
  on public.posts for update to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "Editors can delete their own stories"
  on public.posts for delete to authenticated
  using (auth.uid() = owner_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'wedding-dress-images',
  'wedding-dress-images',
  true,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "Public can view featured dress images"
  on storage.objects for select
  using (bucket_id = 'wedding-dress-images');

create policy "Editors can upload images to their own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'wedding-dress-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Editors can update their own images"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'wedding-dress-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Editors can delete their own images"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'wedding-dress-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

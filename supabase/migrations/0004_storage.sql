-- Storage buckets.
--
-- Supabase Storage has its own RLS surface on storage.objects, entirely separate
-- from the table policies in 0003. A bucket left public is readable by anyone
-- who can guess a URL, with no session and no audit trail -- so both buckets
-- here are private and every read goes through a signed URL.

-- ---------------------------------------------------------------- id-documents
-- Photographs of physical student ID cards. The most sensitive data in the
-- system: regulated personal data under the DPDP Act, retained only until a
-- reviewer makes a decision (see apply_id_review in 0002).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'id-documents',
  'id-documents',
  false,
  5242880,  -- 5 MB; compressed client-side before upload
  array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm']
)
on conflict (id) do update
set public             = excluded.public,
    file_size_limit    = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Path convention: id-documents/{user_id}/{uuid}.{ext}
-- The first path segment is the owner, which is what these policies key on.

create policy "id docs: owner uploads to own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'id-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "id docs: owner reads own"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'id-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Reviewers need to see the document to make a decision. Nobody else does:
-- there is deliberately no peer-visibility policy on this bucket.
create policy "id docs: admin reads all"
  on storage.objects for select to authenticated
  using (bucket_id = 'id-documents' and is_admin());

create policy "id docs: admin deletes"
  on storage.objects for delete to authenticated
  using (bucket_id = 'id-documents' and is_admin());

-- ---------------------------------------------------------------- listing-media
-- Item photos and verification videos. Private rather than public: listings are
-- cluster-scoped, so a public bucket would leak every item photo across campuses
-- and to the open internet regardless of who can see the listing row.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'listing-media',
  'listing-media',
  false,
  10485760,  -- 10 MB, sized for a 20s verification video
  array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm']
)
on conflict (id) do update
set public             = excluded.public,
    file_size_limit    = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "listing media: seller uploads to own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'listing-media'
    and (storage.foldername(name))[1] = auth.uid()::text
    and is_verified()
  );

create policy "listing media: seller manages own"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'listing-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Any verified student may read listing media; which listings they can actually
-- discover is still constrained by the cluster scoping on the listings table.
create policy "listing media: verified students read"
  on storage.objects for select to authenticated
  using (bucket_id = 'listing-media' and is_verified());

create policy "listing media: admin manages"
  on storage.objects for all to authenticated
  using (bucket_id = 'listing-media' and is_admin())
  with check (bucket_id = 'listing-media' and is_admin());

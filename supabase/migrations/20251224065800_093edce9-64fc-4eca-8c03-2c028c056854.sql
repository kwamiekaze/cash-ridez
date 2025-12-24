-- Create a public bucket for deterministic call-center audio used by Twilio <Play>
insert into storage.buckets (id, name, public)
values ('call_center_audio', 'call_center_audio', true)
on conflict (id) do update set public = true;

-- Public read access for Twilio to fetch audio files
create policy "Public can read call center audio"
on storage.objects
for select
using (bucket_id = 'call_center_audio');

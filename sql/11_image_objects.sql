-- Bright EngMath Live Classroom Board : pictures on a board. Run after 10_idea_board.sql. Safe to run again.
-- A picture is an object of type 'image' (a small JPEG kept inside the object, 300000 bytes at most: see objects_guard).
alter table public.objects drop constraint if exists objects_type_check;
alter table public.objects add constraint objects_type_check
  check (type in ('pen','highlighter','text','line','arrow','rect','ellipse','stamp','image'));

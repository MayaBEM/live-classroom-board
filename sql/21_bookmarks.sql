-- Bright EngMath Live Classroom Board : bookmarks. A page can be bookmarked by the teacher, and a board remembers the page the teacher stopped at.
-- Run after 20_textbooks.sql. Safe to run again.
alter table public.pages add column if not exists bookmarked boolean not null default false;
-- (no foreign key on purpose: a second link between boards and pages makes the pages(count) lookup ambiguous)
alter table public.boards add column if not exists resume_page uuid;
alter table public.boards drop constraint if exists boards_resume_page_fkey;
notify pgrst, 'reload schema';

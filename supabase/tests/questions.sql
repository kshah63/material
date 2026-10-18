-- The worksheet maker's tables, policies and save_crops (20261017000009_questions.sql).
-- Every check is an assert, so the first one that fails stops the run.
--   PGHOST=localhost PGUSER=postgres bash supabase/tests/run.sh
\set ON_ERROR_STOP 1
\pset footer off
-- Fixtures: an admin; an in_charge, a teacher and a student in course A; an in_charge
-- and a teacher in course B. Course A has two teacher-only banks (bank.pdf, bank2.pdf)
-- and open.pdf, which students can see; course B has bankB.pdf. One topic per course.
insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-0000000000a1','admin@x'),
 ('00000000-0000-0000-0000-0000000000c1','ic@x'),
 ('00000000-0000-0000-0000-0000000000e1','t@x'),
 ('00000000-0000-0000-0000-0000000000f1','s@x'),
 ('00000000-0000-0000-0000-0000000000c2','icB@x'),
 ('00000000-0000-0000-0000-0000000000e2','tB@x');
update public.profiles set app_role='admin' where email='admin@x';
insert into public.courses (id,name) values ('aaaaaaaa-0000-0000-0000-000000000001','A'),('bbbbbbbb-0000-0000-0000-000000000001','B');
insert into public.course_memberships (course_id,user_id,role) values
 ('aaaaaaaa-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c1','in_charge'),
 ('aaaaaaaa-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000e1','teacher'),
 ('aaaaaaaa-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000f1','student'),
 ('bbbbbbbb-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c2','in_charge'),
 ('bbbbbbbb-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000e2','teacher');
insert into public.folders (id,course_id,name,teacher_only) values
 ('f0000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','Banks',true),
 ('f0000000-0000-0000-0000-000000000002','bbbbbbbb-0000-0000-0000-000000000001','Banks',true);
insert into public.files (id,course_id,folder_id,name,storage_path) values
 ('11111111-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','f0000000-0000-0000-0000-000000000001','bank.pdf','courses/a/1.pdf'),
 ('11111111-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000001',null,'open.pdf','courses/a/2.pdf'),
 ('11111111-0000-0000-0000-000000000003','aaaaaaaa-0000-0000-0000-000000000001','f0000000-0000-0000-0000-000000000001','bank2.pdf','courses/a/3.pdf'),
 ('22222222-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000001','f0000000-0000-0000-0000-000000000002','bankB.pdf','courses/b/1.pdf');
insert into public.question_topics (id,course_id,name,position) values
 ('70000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','Fractions',1),
 ('70000000-0000-0000-0000-000000000002','bbbbbbbb-0000-0000-0000-000000000001','Algebra',1);

-- Run _sql as _uid; its text result, or 'ERR: ' and the message.
create or replace function pg_temp.as_user(_uid uuid, _sql text) returns text language plpgsql as $$
declare r text; begin
  perform set_config('request.jwt.claim.sub', _uid::text, true);
  set local role authenticated;
  begin execute _sql into r; exception when others then r := 'ERR: ' || sqlerrm; end;
  reset role; return r; end $$;
-- One save_crops call as _uid: 'OK', or 'ERR: ' and the message.
create or replace function pg_temp.save(_uid uuid, _file uuid, _add text, _edit text, _remove text default '{}') returns text language sql as $$
  select coalesce(nullif(pg_temp.as_user(_uid, format(
    'select public.save_crops(%L, %L::jsonb, %L::jsonb, %L::uuid[])::text', _file, _add, _edit, _remove)), ''), 'OK') $$;
-- The question holding a box at this y0, and its box n (as the owner, no RLS).
create or replace function pg_temp.q(_y0 real) returns uuid language sql as $$
  select question_id from public.question_boxes where y0 = _y0 $$;
create or replace function pg_temp.b(_q uuid, _n int) returns uuid language sql as $$
  select id from public.question_boxes where question_id = _q and box_no = _n $$;
-- A question's boxes as 'box_no:page:y0', in print order.
create or replace function pg_temp.shape(_q uuid) returns text language sql as $$
  select string_agg(box_no || ':' || page || ':' || y0, ' ' order by box_no) from public.question_boxes where question_id = _q $$;
-- Every row of both tables, to show a refused save wrote nothing.
create or replace function pg_temp.world() returns text language sql as $$
  select coalesce((select string_agg(id || topic_id::text, ',' order by id) from public.questions), '') || '|' ||
         coalesce((select string_agg(concat_ws(':', id, question_id, box_no, page, x0, y0, x1, y1, pos), ',' order by id) from public.question_boxes), '') $$;
-- What every save must leave: no question without a box, boxes numbered 1..n.
create or replace function pg_temp.invariants() returns void language plpgsql as $$ begin
  assert not exists (select 1 from public.questions q where not exists (select 1 from public.question_boxes b where b.question_id = q.id)),
    'a question has no box';
  assert not exists (select 1 from (select question_id, count(*) c, max(box_no) m from public.question_boxes group by question_id) s where c <> m),
    'a question''s boxes are not numbered 1..n';
end $$;

\echo '--- 1. in_charge A saves page 1: Q1 one box; Q2 and Q3 share stimulus S (box 1 of each, copied)'
do $$ begin
  assert pg_temp.save('00000000-0000-0000-0000-0000000000c1', '11111111-0000-0000-0000-000000000001', $j$[
    {"id":"a0000000-0000-0000-0000-000000000001","topic_id":"70000000-0000-0000-0000-000000000001","boxes":[{"page":1,"x0":40,"y0":600,"x1":550,"y1":700,"pos":0}]},
    {"id":"a0000000-0000-0000-0000-000000000002","topic_id":null,"boxes":[{"page":1,"x0":40,"y0":520,"x1":550,"y1":590,"pos":1},{"page":1,"x0":40,"y0":450,"x1":550,"y1":510,"pos":2}]},
    {"id":"a0000000-0000-0000-0000-000000000003","topic_id":null,"boxes":[{"page":1,"x0":40,"y0":520,"x1":550,"y1":590,"pos":1},{"page":1,"x0":40,"y0":380,"x1":550,"y1":440,"pos":3}]}
  ]$j$, '[]') = 'OK';
  assert (select count(*) from public.questions) = 3;
  assert (select count(*) from public.question_boxes) = 5;
  assert (select bool_and(created_by = '00000000-0000-0000-0000-0000000000c1') from public.questions);
  assert pg_temp.shape(pg_temp.q(600)) = '1:1:600';
  assert pg_temp.shape(pg_temp.q(450)) = '1:1:520 2:1:450';
  assert pg_temp.shape(pg_temp.q(380)) = '1:1:520 2:1:380';
  assert pg_temp.q(450) <> pg_temp.q(380), 'the stimulus is copied, not shared';
  assert (select topic_id from public.questions where id = pg_temp.q(600)) = '70000000-0000-0000-0000-000000000001';
  assert pg_temp.save('00000000-0000-0000-0000-0000000000c2', '22222222-0000-0000-0000-000000000001',
    '[{"id":"a0000000-0000-0000-0000-000000000004","topic_id":"70000000-0000-0000-0000-000000000002","boxes":[{"page":1,"x0":1,"y0":1,"x1":100,"y1":100,"pos":0}]}]', '[]') = 'OK';
  assert pg_temp.save('00000000-0000-0000-0000-0000000000c1', '11111111-0000-0000-0000-000000000003',
    '[{"id":"a0000000-0000-0000-0000-000000000005","topic_id":null,"boxes":[{"page":1,"x0":1,"y0":2,"x1":100,"y1":100,"pos":0}]}]', '[]') = 'OK';
  perform pg_temp.invariants();
end $$;

\echo '--- 2. who sees what: questions | boxes | sources for A | topics'
do $$ declare r record; begin
  for r in select * from (values
    ('admin',       '00000000-0000-0000-0000-0000000000a1'::uuid, '5|7|bank.pdf=3/1,bank2.pdf=1/1|2'),
    ('in_charge A', '00000000-0000-0000-0000-0000000000c1', '4|6|bank.pdf=3/1,bank2.pdf=1/1|1'),
    ('teacher A',   '00000000-0000-0000-0000-0000000000e1', '4|6|bank.pdf=3/1,bank2.pdf=1/1|1'),
    ('student A',   '00000000-0000-0000-0000-0000000000f1', '0|0|-|0'),
    ('in_charge B', '00000000-0000-0000-0000-0000000000c2', '1|1|-|1'),
    ('teacher B',   '00000000-0000-0000-0000-0000000000e2', '1|1|-|1')) v(who, uid, want)
  loop
    assert pg_temp.as_user(r.uid, $s$ select (select count(*) from public.questions) || '|' || (select count(*) from public.question_boxes) || '|' ||
      (select coalesce(string_agg(file_name || '=' || questions || '/' || pages, ',' order by file_name), '-') from public.question_sources where course_id = 'aaaaaaaa-0000-0000-0000-000000000001') || '|' ||
      (select count(*) from public.question_topics) $s$) = r.want, r.who;
  end loop;
  -- The read policies' course list: every course for an admin, a member's teaching courses, none for a student.
  assert pg_temp.as_user('00000000-0000-0000-0000-0000000000a1', 'select cardinality(public.question_course_ids())::text') = '2';
  assert pg_temp.as_user('00000000-0000-0000-0000-0000000000e1', 'select public.question_course_ids()::text') = '{aaaaaaaa-0000-0000-0000-000000000001}';
  assert pg_temp.as_user('00000000-0000-0000-0000-0000000000f1', 'select public.question_course_ids()::text') = '{}';
end $$;
\echo '--- 2b. anon: permission denied on all four, and on the functions'
do $$ declare t text; begin
  foreach t in array array['questions','question_boxes','question_sources','question_topics'] loop
    begin
      set local role anon;
      execute format('select count(*) from public.%I', t);
      assert false, 'anon read ' || t;
    exception when insufficient_privilege then null;
    end;
    reset role;
  end loop;
  -- Asked of the grant itself: anon's save_crops of nothing would also fail on the tables.
  foreach t in array array['public.save_crops(uuid, jsonb, jsonb, uuid[])', 'public.can_crop_file(uuid)',
                           'public.topic_fits(uuid, uuid)', 'public.question_course_ids()'] loop
    assert not has_function_privilege('anon', t, 'execute'), 'anon may run ' || t;
    assert has_function_privilege('authenticated', t, 'execute'), 'authenticated may not run ' || t;
  end loop;
end $$;

\echo '--- 3. Q1 runs over a page break: page 2 adds its box 2; box 1 listed by id alone keeps its box'
do $$ declare q1 uuid := pg_temp.q(600); begin
  assert pg_temp.save('00000000-0000-0000-0000-0000000000c1', '11111111-0000-0000-0000-000000000001', '[]',
    format('[{"id":"%s","topic_id":"70000000-0000-0000-0000-000000000001","boxes":[{"id":"%s"},{"page":2,"x0":40,"y0":650,"x1":550,"y1":780,"pos":0}]}]', q1, pg_temp.b(q1, 1))) = 'OK';
  assert pg_temp.shape(q1) = '1:1:600 2:2:650';
  assert (select x0 = 40 and x1 = 550 and y1 = 700 from public.question_boxes where id = pg_temp.b(q1, 1));
  assert pg_temp.as_user('00000000-0000-0000-0000-0000000000e1', $s$ select questions || '/' || pages from public.question_sources where file_id = '11111111-0000-0000-0000-000000000001' $s$) = '3/2';
  perform pg_temp.invariants();
end $$;

\echo '--- 4. allowed, each rolled back: a box on a page before box 1; an edit with no topic keeps it; a stimulus put in front of a saved question; a box moved; an admin crops'
begin;
do $$ declare q1 uuid := pg_temp.q(600); begin
  assert pg_temp.save('00000000-0000-0000-0000-0000000000c1', '11111111-0000-0000-0000-000000000001',
    '[{"id":"a0000000-0000-0000-0000-000000000006","topic_id":null,"boxes":[{"page":3,"x0":40,"y0":101,"x1":550,"y1":200,"pos":0},{"page":2,"x0":40,"y0":102,"x1":550,"y1":200,"pos":5}]}]', '[]') = 'OK';
  assert pg_temp.shape(pg_temp.q(101)) = '1:3:101 2:2:102';
  -- A page save sends reading order and no topic, so it keeps the topic somebody else may have set.
  assert pg_temp.save('00000000-0000-0000-0000-0000000000c1', '11111111-0000-0000-0000-000000000001', '[]',
    format('[{"id":"%s","boxes":[{"id":"%s","pos":4},{"id":"%s"}]}]', q1, pg_temp.b(q1, 1), pg_temp.b(q1, 2))) = 'OK';
  assert (select topic_id from public.questions where id = q1) = '70000000-0000-0000-0000-000000000001', 'an edit with no topic_id cleared the topic';
  assert (select pos from public.question_boxes where id = pg_temp.b(q1, 1)) = 4;
  -- A null topic_id clears it; a kept box may send its own page.
  assert pg_temp.save('00000000-0000-0000-0000-0000000000c1', '11111111-0000-0000-0000-000000000001', '[]',
    format('[{"id":"%s","topic_id":null,"boxes":[{"page":1,"x0":40,"y0":705,"x1":550,"y1":760,"pos":0},{"id":"%s","page":1,"x0":30,"y0":600,"x1":550,"y1":700,"pos":1},{"id":"%s"}]}]',
      q1, pg_temp.b(q1, 1), pg_temp.b(q1, 2))) = 'OK';
  assert pg_temp.shape(q1) = '1:1:705 2:1:600 3:2:650';
  assert (select x0 from public.question_boxes where question_id = q1 and box_no = 2) = 30;
  assert (select topic_id from public.questions where id = q1) is null;
  -- An admin crops too, in a course they are not a member of.
  assert pg_temp.save('00000000-0000-0000-0000-0000000000a1', '22222222-0000-0000-0000-000000000001',
    '[{"id":"a0000000-0000-0000-0000-000000000020","topic_id":"70000000-0000-0000-0000-000000000002","boxes":[{"page":2,"x0":1,"y0":103,"x1":100,"y1":200,"pos":0}]}]', '[]') = 'OK';
  assert (select created_by from public.questions where id = 'a0000000-0000-0000-0000-000000000020') = '00000000-0000-0000-0000-0000000000a1';
  perform pg_temp.invariants();
end $$;
rollback;

\echo '--- 5. the shared stimulus: moved in both, deleted from one, deleted from both'
begin;
do $$ declare q2 uuid := pg_temp.q(450); q3 uuid := pg_temp.q(380); begin
  assert pg_temp.save('00000000-0000-0000-0000-0000000000c1', '11111111-0000-0000-0000-000000000001', '[]',
    format('[{"id":"%1$s","topic_id":null,"boxes":[{"id":"%2$s","x0":40.17,"y0":514.83,"x1":550.4,"y1":595.0999,"pos":1},{"id":"%3$s"}]},
             {"id":"%4$s","topic_id":null,"boxes":[{"id":"%5$s","x0":40.17,"y0":514.83,"x1":550.4,"y1":595.0999,"pos":1},{"id":"%6$s"}]}]',
      q2, pg_temp.b(q2, 1), pg_temp.b(q2, 2), q3, pg_temp.b(q3, 1), pg_temp.b(q3, 2))) = 'OK';
  assert (select count(distinct (page, x0, y0, x1, y1)) from public.question_boxes where box_no = 1 and question_id in (q2, q3)) = 1;
  -- The copies stay equal through text, which is how JSON carries them to the screen and back.
  assert (select bool_and(x0::text::real = x0 and y0::text::real = y0 and x1::text::real = x1 and y1::text::real = y1)
            from public.question_boxes where box_no = 1 and question_id in (q2, q3));
  assert pg_temp.save('00000000-0000-0000-0000-0000000000c1', '11111111-0000-0000-0000-000000000001', '[]', '[]',
    format('{%s}', pg_temp.b(q2, 1))) = 'OK';
  assert pg_temp.shape(q2) = '1:1:450' and pg_temp.shape(q3) = '1:1:514.83 2:1:380';
  assert pg_temp.save('00000000-0000-0000-0000-0000000000c1', '11111111-0000-0000-0000-000000000001', '[]', '[]',
    format('{%s}', pg_temp.b(q3, 1))) = 'OK';
  assert pg_temp.shape(q3) = '1:1:380';
  assert (select count(*) from public.questions where file_id = '11111111-0000-0000-0000-000000000001') = 3;
  perform pg_temp.invariants();
end $$;
rollback;

\echo '--- 6. deleting: a question over two pages from one page; a question with no box left; no Trash'
begin;
do $$ declare q1 uuid := pg_temp.q(600); q3 uuid := pg_temp.q(380); begin
  assert pg_temp.save('00000000-0000-0000-0000-0000000000c1', '11111111-0000-0000-0000-000000000001', '[]',
    format('[{"id":"%s","topic_id":null,"boxes":[]}]', q1), format('{%s,%s}', pg_temp.b(q1, 1), pg_temp.b(q1, 2))) = 'OK';
  assert not exists (select 1 from public.questions where id = q1);
  assert pg_temp.save('00000000-0000-0000-0000-0000000000c1', '11111111-0000-0000-0000-000000000001', '[]', '[]',
    format('{%s,%s}', pg_temp.b(q3, 1), pg_temp.b(q3, 2))) = 'OK';
  assert not exists (select 1 from public.questions where id = q3);
  assert (select count(*) from public.question_boxes where question_id in (q1, q3)) = 0;
  perform pg_temp.invariants();
end $$;
rollback;

\echo '--- 7. refused, and nothing written (each compares every row before and after)'
do $$ declare
  q1 uuid := pg_temp.q(600); q2 uuid := pg_temp.q(450); q3 uuid := pg_temp.q(380);
  qb uuid := (select id from public.questions where file_id = '22222222-0000-0000-0000-000000000001');
  q2b uuid := pg_temp.q(2);
  ic constant uuid := '00000000-0000-0000-0000-0000000000c1';
  bank constant uuid := '11111111-0000-0000-0000-000000000001';
  good constant text := '{"id":"a0000000-0000-0000-0000-000000000007","topic_id":null,"boxes":[{"page":5,"x0":1,"y0":1,"x1":9,"y1":9,"pos":0}]}';
  -- Why each must be refused; any other error is a broken case, not a refusal.
  elsewhere constant text := 'A question in this bank was changed elsewhere, or cannot be changed by you.';
  not_allowed constant text := 'new row violates row-level security policy for table "questions"';
  too_many constant text := 'new row for relation "question_boxes" violates check constraint "question_boxes_box_no_check"';
  no_box constant text := 'A question needs at least one box.';
  twice constant text := 'duplicate key value violates unique constraint "question_boxes_once_key"';
  bad_box constant text := 'new row for relation "question_boxes" violates check constraint "question_boxes_box_check"';
  bad_page constant text := 'new row for relation "question_boxes" violates check constraint "question_boxes_page_check"';
  no_page constant text := 'null value in column "page" of relation "question_boxes"';
  no_pos constant text := 'null value in column "pos" of relation "question_boxes"';
  moved_page constant text := 'A saved box keeps its page: remove it and add it again.';
  before text := pg_temp.world(); r record; got text;
begin
  for r in select * from (values
    ('a fifth box on a saved question', format('[%s]', good), format('[{"id":"%s","topic_id":null,"boxes":[{"id":"%s"},{"id":"%s"},{"page":3,"x0":1,"y0":1,"x1":9,"y1":9,"pos":0},{"page":4,"x0":1,"y0":1,"x1":9,"y1":9,"pos":0},{"page":5,"x0":1,"y0":1,"x1":9,"y1":9,"pos":0}]}]', q1, pg_temp.b(q1, 1), pg_temp.b(q1, 2)), '{}', too_many),
    ('a new question of five boxes', '[{"id":"a0000000-0000-0000-0000-000000000008","topic_id":null,"boxes":[{"page":1,"x0":1,"y0":1,"x1":9,"y1":9,"pos":0},{"page":2,"x0":1,"y0":1,"x1":9,"y1":9,"pos":0},{"page":3,"x0":1,"y0":1,"x1":9,"y1":9,"pos":0},{"page":4,"x0":1,"y0":1,"x1":9,"y1":9,"pos":0},{"page":5,"x0":1,"y0":1,"x1":9,"y1":9,"pos":0}]}]', '[]', '{}', too_many),
    ('a new question with no boxes', format('[%s,{"id":"a0000000-0000-0000-0000-000000000009","topic_id":null,"boxes":[]}]', good), '[]', '{}', no_box),
    ('a new question with no box list', format('[%s,{"id":"a0000000-0000-0000-0000-000000000010","topic_id":null}]', good), '[]', '{}', no_box),
    ('the same box twice in one question', '[{"id":"a0000000-0000-0000-0000-000000000011","topic_id":null,"boxes":[{"page":1,"x0":1,"y0":1,"x1":9,"y1":9,"pos":0},{"page":1,"x0":1,"y0":1,"x1":9,"y1":9,"pos":0}]}]', '[]', '{}', twice),
    ('an edit that leaves out a box it has', format('[%s]', good), format('[{"id":"%s","topic_id":null,"boxes":[{"id":"%s"}]}]', q1, pg_temp.b(q1, 1)), '{}', elsewhere),
    ('an edit that lists another question''s box', format('[%s]', good), format('[{"id":"%s","topic_id":null,"boxes":[{"id":"%s"},{"id":"%s"}]}]', q2, pg_temp.b(q3, 1), pg_temp.b(q2, 2)), '{}', elsewhere),
    ('an edit that lists another question''s box as well as its own', '[]', format('[{"id":"%s","topic_id":null,"boxes":[{"id":"%s"},{"id":"%s"},{"id":"%s"}]}]', q2, pg_temp.b(q2, 1), pg_temp.b(q2, 2), pg_temp.b(q3, 2)), '{}', elsewhere),
    ('an edit that lists a box twice', '[]', format('[{"id":"%s","topic_id":null,"boxes":[{"id":"%s"},{"id":"%s"},{"id":"%s"}]}]', q1, pg_temp.b(q1, 1), pg_temp.b(q1, 2), pg_temp.b(q1, 2)), '{}', elsewhere),
    ('an edit that keeps a box it also removes', '[]', format('[{"id":"%s","topic_id":null,"boxes":[{"id":"%s"},{"id":"%s"}]}]', q1, pg_temp.b(q1, 1), pg_temp.b(q1, 2)), format('{%s}', pg_temp.b(q1, 2)), elsewhere),
    ('one question edited twice', '[]', format('[{"id":"%1$s","topic_id":null,"boxes":[{"id":"%2$s"},{"id":"%3$s"}]},{"id":"%1$s","topic_id":null,"boxes":[{"id":"%2$s"},{"id":"%3$s"}]}]', q1, pg_temp.b(q1, 1), pg_temp.b(q1, 2)), '{}', elsewhere),
    ('an edit of a question in another course''s bank', format('[%s]', good), format('[{"id":"%s","topic_id":null,"boxes":[{"id":"%s"}]}]', qb, pg_temp.b(qb, 1)), '{}', elsewhere),
    ('removing a box of another course''s bank', format('[%s]', good), '[]', format('{%s}', pg_temp.b(qb, 1)), elsewhere),
    ('removing a box of another bank in this course', format('[%s]', good), '[]', format('{%s}', pg_temp.b(q2b, 1)), elsewhere),
    ('an edit of a question in another bank in this course', format('[%s]', good), format('[{"id":"%s","topic_id":null,"boxes":[{"id":"%s"}]}]', q2b, pg_temp.b(q2b, 1)), '{}', elsewhere),
    ('removing one box twice', format('[%s]', good), '[]', format('{%s,%s}', pg_temp.b(q3, 2), pg_temp.b(q3, 2)), elsewhere),
    ('removing a box that is not there', format('[%s]', good), '[]', '{00000000-0000-0000-0000-00000000dead}', elsewhere),
    ('a topic of another course on a new question', '[{"id":"a0000000-0000-0000-0000-000000000012","topic_id":"70000000-0000-0000-0000-000000000002","boxes":[{"page":1,"x0":1,"y0":1,"x1":9,"y1":9,"pos":0}]}]', '[]', '{}', not_allowed),
    ('a topic of another course on a saved question', format('[%s]', good), format('[{"id":"%s","topic_id":"70000000-0000-0000-0000-000000000002","boxes":[{"id":"%s"},{"id":"%s"}]}]', q1, pg_temp.b(q1, 1), pg_temp.b(q1, 2)), '{}', not_allowed),
    ('an inverted new box', format('[%s,{"id":"a0000000-0000-0000-0000-000000000013","topic_id":null,"boxes":[{"page":1,"x0":9,"y0":1,"x1":1,"y1":9,"pos":0}]}]', good), '[]', '{}', bad_box),
    ('a NaN corner', '[{"id":"a0000000-0000-0000-0000-000000000014","topic_id":null,"boxes":[{"page":1,"x0":1,"y0":1,"x1":"NaN","y1":9,"pos":0}]}]', '[]', '{}', bad_box),
    ('a NaN first corner', '[{"id":"a0000000-0000-0000-0000-000000000015","topic_id":null,"boxes":[{"page":1,"x0":"NaN","y0":1,"x1":9,"y1":9,"pos":0}]}]', '[]', '{}', bad_box),
    ('page 0', '[{"id":"a0000000-0000-0000-0000-000000000016","topic_id":null,"boxes":[{"page":0,"x0":1,"y0":1,"x1":9,"y1":9,"pos":0}]}]', '[]', '{}', bad_page),
    ('a box with no page', '[{"id":"a0000000-0000-0000-0000-000000000017","topic_id":null,"boxes":[{"x0":1,"y0":1,"x1":9,"y1":9,"pos":0}]}]', '[]', '{}', no_page),
    ('a saved box moved inside out', '[]', format('[{"id":"%s","topic_id":null,"boxes":[{"id":"%s","x0":600,"pos":0},{"id":"%s"}]}]', q1, pg_temp.b(q1, 1), pg_temp.b(q1, 2)), '{}', bad_box),
    ('a new box in a saved question with no pos', '[]', format('[{"id":"%s","topic_id":null,"boxes":[{"id":"%s"},{"id":"%s"},{"page":3,"x0":1,"y0":1,"x1":9,"y1":9}]}]', q1, pg_temp.b(q1, 1), pg_temp.b(q1, 2)), '{}', no_pos),
    ('a kept box sent with another page', '[]', format('[{"id":"%s","topic_id":null,"boxes":[{"id":"%s","page":5,"x0":41,"y0":610,"x1":551,"y1":701,"pos":0},{"id":"%s"}]}]', q1, pg_temp.b(q1, 1), pg_temp.b(q1, 2)), '{}', moved_page)
  ) v(what, add_, edit_, remove_, why)
  loop
    got := pg_temp.save(ic, bank, r.add_, r.edit_, r.remove_);
    assert starts_with(got, 'ERR: ' || r.why), r.what || ': ' || got;
    assert pg_temp.world() = before, r.what || ' wrote something';
  end loop;
end $$;

\echo '--- 8. refused by who is asking, through the function and straight at the tables'
do $$ declare
  q1 uuid := pg_temp.q(600);
  a constant uuid := '00000000-0000-0000-0000-0000000000a1';
  t constant uuid := '00000000-0000-0000-0000-0000000000e1';
  s constant uuid := '00000000-0000-0000-0000-0000000000f1';
  icb constant uuid := '00000000-0000-0000-0000-0000000000c2';
  tb constant uuid := '00000000-0000-0000-0000-0000000000e2';
  ic constant uuid := '00000000-0000-0000-0000-0000000000c1';
  bank constant uuid := '11111111-0000-0000-0000-000000000001';
  good constant text := '[{"id":"a0000000-0000-0000-0000-000000000018","topic_id":null,"boxes":[{"page":5,"x0":1,"y0":1,"x1":9,"y1":9,"pos":0}]}]';
  no_question constant text := 'ERR: new row violates row-level security policy for table "questions"';
  no_box constant text := 'ERR: new row violates row-level security policy for table "question_boxes"';
  elsewhere constant text := 'ERR: A question in this bank was changed elsewhere, or cannot be changed by you.';
  before text := pg_temp.world();
  crop text := $q$ select public.can_crop_file('11111111-0000-0000-0000-000000000001')::text $q$;
  q_in text := $q$ insert into public.questions (file_id) values ('11111111-0000-0000-0000-000000000001') returning 'INSERTED' $q$;
  box_in text := format($q$ insert into public.question_boxes (question_id, file_id, box_no, page, x0, y0, x1, y1) values ('%s', '11111111-0000-0000-0000-000000000001', 3, 3, 1, 1, 9, 9) returning 'INSERTED' $q$, q1);
begin
  -- Who may crop bank.pdf: admin and its in_charge only. Nobody crops open.pdf, which students can see.
  assert pg_temp.as_user(a, crop) = 'true', 'admin can crop';
  assert pg_temp.as_user(ic, crop) = 'true', 'in_charge A can crop';
  assert pg_temp.as_user(t, crop) = 'false', 'teacher A cannot crop';
  assert pg_temp.as_user(s, crop) = 'false', 'student A cannot crop';
  assert pg_temp.as_user(icb, crop) = 'false', 'in_charge B cannot crop a course A bank';
  assert pg_temp.as_user(tb, crop) = 'false', 'teacher B cannot crop';
  assert pg_temp.as_user(ic, $q$ select public.can_crop_file('11111111-0000-0000-0000-000000000002')::text $q$) = 'false', 'in_charge A cannot crop open.pdf';
  assert pg_temp.as_user(a, $q$ select public.can_crop_file('11111111-0000-0000-0000-000000000002')::text $q$) = 'false', 'nor can an admin';

  assert pg_temp.save(t, bank, good, '[]') = no_question, 'teacher save';
  assert pg_temp.save(s, bank, good, '[]') = no_question, 'student save';
  assert pg_temp.save(icb, bank, good, '[]') = no_question, 'in_charge B saves on a course A bank';
  assert pg_temp.save(t, bank, '[]', '[]', format('{%s}', pg_temp.b(q1, 2))) = elsewhere, 'teacher removes a box';
  assert pg_temp.save(t, bank, '[]', format('[{"id":"%s","topic_id":null,"boxes":[{"id":"%s"},{"id":"%s"}]}]', q1, pg_temp.b(q1, 1), pg_temp.b(q1, 2))) = elsewhere, 'teacher edits a question';
  assert pg_temp.save(ic, '11111111-0000-0000-0000-000000000002', good, '[]') = no_question, 'in_charge A crops open.pdf, which students can see';
  assert pg_temp.as_user(t, q_in) = no_question, 'teacher inserts a question';
  assert pg_temp.as_user(s, q_in) = no_question, 'student inserts a question';
  assert pg_temp.as_user(icb, q_in) = no_question, 'in_charge B inserts a question on a course A bank';
  assert pg_temp.as_user(t, box_in) = no_box, 'teacher inserts a box';
  assert pg_temp.as_user(icb, box_in) = no_box, 'in_charge B inserts a box in a course A question';
  assert pg_temp.as_user(t, $q$ with u as (update public.question_boxes set x0 = 2 returning 1) select count(*)::text from u $q$) = '0', 'teacher updates boxes';
  assert pg_temp.as_user(t, $q$ with u as (update public.questions set topic_id = null returning 1) select count(*)::text from u $q$) = '0', 'teacher changes a topic';
  assert pg_temp.as_user(t, $q$ with d as (delete from public.question_boxes returning 1) select count(*)::text from d $q$) = '0', 'teacher deletes boxes';
  assert pg_temp.as_user(t, $q$ with d as (delete from public.questions returning 1) select count(*)::text from d $q$) = '0', 'teacher deletes questions';
  assert pg_temp.as_user(icb, $q$ with d as (delete from public.question_boxes b using public.questions q where q.id = b.question_id and q.file_id = '11111111-0000-0000-0000-000000000001' returning 1) select count(*)::text from d $q$) = '0', 'in_charge B deletes course A boxes';
  assert pg_temp.as_user(icb, $q$ with u as (update public.questions set topic_id = null where file_id = '11111111-0000-0000-0000-000000000001' returning 1) select count(*)::text from u $q$) = '0', 'in_charge B changes a course A topic';
  assert pg_temp.as_user(icb, $q$ with d as (delete from public.questions where file_id = '11111111-0000-0000-0000-000000000001' returning 1) select count(*)::text from d $q$) = '0', 'in_charge B deletes course A questions';
  -- Column grants: a box keeps its question, file and page; a question keeps its file; created_by is never written.
  assert pg_temp.as_user(ic, format($q$ update public.question_boxes set page = 3 where id = '%s' returning 'UPDATED' $q$, pg_temp.b(q1, 1))) like 'ERR: permission denied%', 'a box changes page';
  assert pg_temp.as_user(ic, format($q$ update public.question_boxes set question_id = '%s' where id = '%s' returning 'UPDATED' $q$, pg_temp.q(450), pg_temp.b(q1, 1))) like 'ERR: permission denied%', 'a box changes question';
  assert pg_temp.as_user(ic, format($q$ update public.question_boxes set file_id = '11111111-0000-0000-0000-000000000003' where id = '%s' returning 'UPDATED' $q$, pg_temp.b(q1, 1))) like 'ERR: permission denied%', 'a box changes file';
  assert pg_temp.as_user(ic, format($q$ update public.questions set file_id = '11111111-0000-0000-0000-000000000002' where id = '%s' returning 'UPDATED' $q$, q1)) like 'ERR: permission denied%', 'a question changes file';
  assert pg_temp.as_user(ic, $q$ insert into public.questions (file_id, created_by) values ('11111111-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e1') returning 'INSERTED' $q$) like 'ERR: permission denied%', 'a forged created_by';
  assert pg_temp.as_user(ic, format($q$ update public.questions set created_by = '00000000-0000-0000-0000-0000000000e1' where id = '%s' returning 'UPDATED' $q$, q1)) like 'ERR: permission denied%', 'created_by rewritten';
  -- The composite foreign key: a box is always on its question's file.
  assert pg_temp.as_user(ic, format($q$ insert into public.question_boxes (question_id, file_id, box_no, page, x0, y0, x1, y1) values ('%s', '11111111-0000-0000-0000-000000000003', 3, 3, 1, 1, 9, 9) returning 'INSERTED' $q$, q1)) like 'ERR: insert or update on table "question_boxes" violates foreign key constraint "question_boxes_question_fkey"%', 'a box on another file than its question''s';
  assert pg_temp.as_user(ic, format($q$ insert into public.question_boxes (question_id, file_id, box_no, page, x0, y0, x1, y1) values ('%s', '11111111-0000-0000-0000-000000000001', 3, 3, 1, 1, 'NaN', 9) returning 'INSERTED' $q$, q1)) like 'ERR: new row for relation "question_boxes" violates check constraint "question_boxes_box_check"%', 'a NaN box, straight in';
  assert pg_temp.world() = before, 'a refusal wrote something';
end $$;

\echo '--- 9. the bank made visible to students: teachers still read its boxes; nobody changes them'
begin;
do $$ declare q1 uuid := pg_temp.q(600);
  ic constant uuid := '00000000-0000-0000-0000-0000000000c1';
  before text;
begin
  assert pg_temp.as_user(ic, $q$ with u as (update public.folders set teacher_only = false where id = 'f0000000-0000-0000-0000-000000000001' returning 1) select count(*)::text from u $q$) = '1';
  before := pg_temp.world();
  assert pg_temp.as_user('00000000-0000-0000-0000-0000000000e1', $q$ select (select count(*) from public.question_boxes) || '|' || (select string_agg(file_name || ' ' || eff_teacher_only, ',' order by file_name) from public.question_sources where course_id = 'aaaaaaaa-0000-0000-0000-000000000001') $q$) = '7|bank.pdf false,bank2.pdf false';
  assert pg_temp.as_user('00000000-0000-0000-0000-0000000000f1', 'select count(*)::text from public.question_boxes') = '0', 'students still see no boxes';
  assert pg_temp.as_user(ic, $q$ select public.can_crop_file('11111111-0000-0000-0000-000000000001')::text $q$) = 'false';
  assert pg_temp.save(ic, '11111111-0000-0000-0000-000000000001', '[]', '[]', format('{%s}', pg_temp.b(q1, 2))) = 'ERR: A question in this bank was changed elsewhere, or cannot be changed by you.';
  assert pg_temp.save(ic, '11111111-0000-0000-0000-000000000001', '[{"id":"a0000000-0000-0000-0000-000000000021","topic_id":null,"boxes":[{"page":5,"x0":1,"y0":1,"x1":9,"y1":9,"pos":0}]}]', '[]') = 'ERR: new row violates row-level security policy for table "questions"';
  assert pg_temp.as_user(ic, $q$ with d as (delete from public.question_boxes returning 1) select count(*)::text from d $q$) = '0';
  assert pg_temp.as_user(ic, $q$ with d as (delete from public.questions returning 1) select count(*)::text from d $q$) = '0';
  assert pg_temp.as_user(ic, $q$ with u as (update public.question_boxes set pos = 9 returning 1) select count(*)::text from u $q$) = '0';
  assert pg_temp.as_user(ic, format($q$ insert into public.question_boxes (question_id, file_id, box_no, page, x0, y0, x1, y1) values ('%s', '11111111-0000-0000-0000-000000000001', 3, 3, 1, 1, 9, 9) returning 'INSERTED' $q$, q1)) = 'ERR: new row violates row-level security policy for table "question_boxes"';
  assert pg_temp.world() = before;
end $$;
rollback;

\echo '--- 10. Trash: everyone loses the bank''s boxes, nobody can crop it; restore brings them back'
do $$ begin
  assert pg_temp.as_user('00000000-0000-0000-0000-0000000000c1', $q$ select public.soft_delete_file('11111111-0000-0000-0000-000000000001')::text $q$) not like 'ERR:%';
end $$;
do $$ declare r record; q1 uuid := pg_temp.q(600); begin
  for r in select * from (values ('admin', '00000000-0000-0000-0000-0000000000a1'::uuid), ('in_charge A', '00000000-0000-0000-0000-0000000000c1'), ('teacher A', '00000000-0000-0000-0000-0000000000e1')) v(who, uid) loop
    assert pg_temp.as_user(r.uid, $q$ select (select count(*) from public.questions where file_id = '11111111-0000-0000-0000-000000000001') || '|' ||
      (select count(*) from public.question_boxes b join public.questions q on q.id = b.question_id) || '|' ||
      (select count(*) from public.question_sources where course_id = 'aaaaaaaa-0000-0000-0000-000000000001') $q$) =
      case r.who when 'admin' then '0|2|1' else '0|1|1' end, r.who;
    assert pg_temp.as_user(r.uid, $q$ select public.can_crop_file('11111111-0000-0000-0000-000000000001')::text $q$) = 'false', r.who || ' can crop a bank in Trash';
  end loop;
  assert pg_temp.as_user('00000000-0000-0000-0000-0000000000c1', format($q$ insert into public.question_boxes (question_id, file_id, box_no, page, x0, y0, x1, y1) values ('%s', '11111111-0000-0000-0000-000000000001', 3, 3, 1, 1, 9, 9) returning 'INSERTED' $q$, q1)) = 'ERR: new row violates row-level security policy for table "question_boxes"';
  assert pg_temp.save('00000000-0000-0000-0000-0000000000c1', '11111111-0000-0000-0000-000000000001', '[{"id":"a0000000-0000-0000-0000-000000000019","topic_id":null,"boxes":[{"page":5,"x0":1,"y0":1,"x1":9,"y1":9,"pos":0}]}]', '[]') = 'ERR: new row violates row-level security policy for table "questions"';
  assert pg_temp.save('00000000-0000-0000-0000-0000000000c1', '11111111-0000-0000-0000-000000000001', '[]', '[]', format('{%s}', pg_temp.b(q1, 1))) = 'ERR: A question in this bank was changed elsewhere, or cannot be changed by you.';
end $$;
do $$ begin
  assert pg_temp.as_user('00000000-0000-0000-0000-0000000000c1', $q$ select public.restore_batch((select delete_batch_id from public.files where id = '11111111-0000-0000-0000-000000000001'))::text $q$) not like 'ERR:%';
  assert pg_temp.as_user('00000000-0000-0000-0000-0000000000e1', 'select (select count(*) from public.questions) || ''|'' || (select count(*) from public.question_boxes)') = '4|7';
  assert pg_temp.as_user('00000000-0000-0000-0000-0000000000c1', $q$ select public.can_crop_file('11111111-0000-0000-0000-000000000001')::text $q$) = 'true';
end $$;

\echo '--- 11. the purge''s hard deletes take questions and boxes with them'
begin;
delete from public.files where id = '11111111-0000-0000-0000-000000000001';
do $$ begin assert (select count(*) from public.questions) || '|' || (select count(*) from public.question_boxes) = '2|2'; end $$;
rollback;
begin;
delete from public.folders where id = 'f0000000-0000-0000-0000-000000000001';
do $$ begin assert (select count(*) from public.questions) || '|' || (select count(*) from public.question_boxes) = '1|1'; end $$;
rollback;
begin;
delete from public.courses where id = 'bbbbbbbb-0000-0000-0000-000000000001';
do $$ begin assert (select count(*) from public.questions) || '|' || (select count(*) from public.question_boxes) || '|' || (select count(*) from public.question_topics) = '4|7|1'; end $$;
rollback;
begin;
delete from public.question_topics where id = '70000000-0000-0000-0000-000000000001';
do $$ begin assert (select count(*) from public.questions where topic_id is not null and file_id = '11111111-0000-0000-0000-000000000001') = 0; end $$;
rollback;

\echo '--- 12. question_sources agrees with the tables, for every role'
do $$ declare r record; begin
  for r in select * from (values ('00000000-0000-0000-0000-0000000000a1'::uuid), ('00000000-0000-0000-0000-0000000000c1'), ('00000000-0000-0000-0000-0000000000e1'), ('00000000-0000-0000-0000-0000000000f1'), ('00000000-0000-0000-0000-0000000000c2'), ('00000000-0000-0000-0000-0000000000e2')) v(uid) loop
    assert pg_temp.as_user(r.uid, $q$ select coalesce(string_agg(file_id || '=' || questions || '/' || pages || '@' || first_page, ',' order by file_id), '') from public.question_sources $q$) =
           pg_temp.as_user(r.uid, $q$ select coalesce(string_agg(file_id || '=' || n || '/' || p || '@' || f, ',' order by file_id), '') from (
             select q.file_id, count(distinct q.id) n, count(distinct b.page) p, min(b.page) f from public.questions q join public.question_boxes b on b.question_id = q.id group by q.file_id) s $q$);
  end loop;
end $$;

\echo '--- 13. a box''s policy is its question''s: every role sees exactly the boxes of the questions it sees, also in Trash and student-visible'
do $$ declare r record; begin
  for r in select * from (values ('00000000-0000-0000-0000-0000000000a1'::uuid), ('00000000-0000-0000-0000-0000000000c1'), ('00000000-0000-0000-0000-0000000000e1'), ('00000000-0000-0000-0000-0000000000f1'), ('00000000-0000-0000-0000-0000000000c2'), ('00000000-0000-0000-0000-0000000000e2')) v(uid) loop
    assert pg_temp.as_user(r.uid, $q$ select (count(*) filter (where q.id is null))::text || '|' || (select count(*) from public.questions q2 where not exists (select 1 from public.question_boxes b2 where b2.question_id = q2.id)) from public.question_boxes b left join public.questions q on q.id = b.question_id $q$) = '0|0', r.uid::text;
  end loop;
end $$;
-- The same, with the bank in Trash, and with it visible to students.
begin;
update public.files set deleted_at = now() where id = '11111111-0000-0000-0000-000000000001';
do $$ declare r record; begin
  for r in select * from (values ('00000000-0000-0000-0000-0000000000a1'::uuid), ('00000000-0000-0000-0000-0000000000c1'), ('00000000-0000-0000-0000-0000000000e1'), ('00000000-0000-0000-0000-0000000000f1')) v(uid) loop
    assert pg_temp.as_user(r.uid, $q$ select (count(*) filter (where q.id is null))::text || '|' || (select count(*) from public.questions q2 where not exists (select 1 from public.question_boxes b2 where b2.question_id = q2.id)) from public.question_boxes b left join public.questions q on q.id = b.question_id $q$) = '0|0', 'trash ' || r.uid;
  end loop;
end $$;
rollback;
begin;
update public.folders set teacher_only = false where id = 'f0000000-0000-0000-0000-000000000001';
do $$ declare r record; begin
  assert (select not eff_teacher_only from public.files where id = '11111111-0000-0000-0000-000000000001');
  for r in select * from (values ('00000000-0000-0000-0000-0000000000a1'::uuid), ('00000000-0000-0000-0000-0000000000c1'), ('00000000-0000-0000-0000-0000000000e1'), ('00000000-0000-0000-0000-0000000000f1')) v(uid) loop
    assert pg_temp.as_user(r.uid, $q$ select (count(*) filter (where q.id is null))::text || '|' || (select count(*) from public.questions q2 where not exists (select 1 from public.question_boxes b2 where b2.question_id = q2.id)) from public.question_boxes b left join public.questions q on q.id = b.question_id $q$) = '0|0', 'student-visible ' || r.uid;
  end loop;
end $$;
rollback;

\echo '--- 14. a save retried after its reply was lost is refused, and writes nothing'
do $$ declare w text; begin
  assert pg_temp.save('00000000-0000-0000-0000-0000000000c1', '11111111-0000-0000-0000-000000000003',
    '[{"id":"b0000000-0000-0000-0000-000000000001","topic_id":null,"boxes":[{"page":2,"x0":1,"y0":2,"x1":100,"y1":100,"pos":0}]}]', '[]') = 'OK';
  perform pg_temp.invariants();
  w := pg_temp.world();
  assert pg_temp.save('00000000-0000-0000-0000-0000000000c1', '11111111-0000-0000-0000-000000000003',
    '[{"id":"b0000000-0000-0000-0000-000000000001","topic_id":null,"boxes":[{"page":2,"x0":1,"y0":2,"x1":100,"y1":100,"pos":0}]}]', '[]') like 'ERR: duplicate key%';
  assert pg_temp.world() = w;
  assert pg_temp.save('00000000-0000-0000-0000-0000000000c1', '11111111-0000-0000-0000-000000000003',
    '[{"topic_id":null,"boxes":[{"page":2,"x0":1,"y0":2,"x1":100,"y1":100,"pos":0}]}]', '[]') like 'ERR: null value in column "id" of relation "questions"%';
  assert pg_temp.world() = w;
end $$;
\echo '--- 15. the exact grants on the four relations; no policy on these tables, and no new invoker function, calls auth.uid() bare'
do $$ begin
  -- Table grants, then column grants, for anon and authenticated: anything wider or narrower fails here,
  -- including a grant that only a missing policy still blocks.
  assert (select string_agg(g, ' ' order by g collate "C") from (
      select format('%s:%s:%s', x.grantee::regrole, c.relname, string_agg(x.privilege_type, ',' order by x.privilege_type)) g
        from pg_class c, aclexplode(c.relacl) x
       where c.oid in ('public.questions'::regclass, 'public.question_boxes'::regclass, 'public.question_topics'::regclass, 'public.question_sources'::regclass)
         and x.grantee in ('anon'::regrole, 'authenticated'::regrole)
       group by x.grantee, c.relname
      union all
      select format('%s:%s:%s(%s)', x.grantee::regrole, c.relname, x.privilege_type, string_agg(a.attname, ',' order by a.attname))
        from pg_class c join pg_attribute a on a.attrelid = c.oid, aclexplode(a.attacl) x
       where c.oid in ('public.questions'::regclass, 'public.question_boxes'::regclass, 'public.question_topics'::regclass, 'public.question_sources'::regclass)
         and x.grantee in ('anon'::regrole, 'authenticated'::regrole)
       group by x.grantee, c.relname, x.privilege_type) s)
    = 'authenticated:question_boxes:DELETE,SELECT'
      ' authenticated:question_boxes:INSERT(box_no,file_id,page,pos,question_id,x0,x1,y0,y1)'
      ' authenticated:question_boxes:UPDATE(box_no,pos,x0,x1,y0,y1)'
      ' authenticated:question_sources:SELECT'
      ' authenticated:question_topics:SELECT'
      ' authenticated:questions:DELETE,SELECT'
      ' authenticated:questions:INSERT(file_id,id,topic_id)'
      ' authenticated:questions:UPDATE(topic_id)', 'the grants on the four relations changed';
  assert not exists (
    select 1 from pg_policy p
    where p.polrelid in ('public.questions'::regclass, 'public.question_boxes'::regclass, 'public.question_topics'::regclass)
      and regexp_replace(coalesce(pg_get_expr(p.polqual, p.polrelid), '') || ' ' || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), ''),
                         '\(\s*select\s+auth\.uid\(\)', '', 'gi') ~* 'auth\.uid\(\)');
  assert not exists (
    select 1 from pg_proc f
    where f.pronamespace = 'public'::regnamespace and not f.prosecdef
      and f.proname in ('can_crop_file', 'topic_fits', 'save_crops')
      and regexp_replace(f.prosrc, '\(\s*select\s+auth\.uid\(\)', '', 'gi') ~* 'auth\.uid\(\)');
  assert (select pg_get_expr(polqual, polrelid) from pg_policy where polname = 'questions_select')
       = replace((select pg_get_expr(polqual, polrelid) from pg_policy where polname = 'question_boxes_select'), 'question_boxes.', 'questions.');
end $$;
\echo 'ALL PASSED'

\set ON_ERROR_STOP 0
\pset footer off
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
 ('22222222-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000001','f0000000-0000-0000-0000-000000000002','bankB.pdf','courses/b/1.pdf');
insert into public.question_topics (id,course_id,name,position) values
 ('70000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','Fractions',1),
 ('70000000-0000-0000-0000-000000000002','bbbbbbbb-0000-0000-0000-000000000001','Algebra',1);
select name, eff_teacher_only from public.files order by name;

create or replace function pg_temp.as_user(_uid uuid, _sql text) returns text language plpgsql as $$
declare r text; begin
  perform set_config('request.jwt.claim.sub', _uid::text, true);
  set local role authenticated;
  begin execute _sql into r; exception when others then r := 'ERR: ' || sqlerrm; end;
  reset role; return r; end $$;

\echo '--- 1. in_charge A saves page 1 of bank.pdf (2 crops) through save_page_crops; created_by from default'
begin; select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1', $q$ select public.save_page_crops('11111111-0000-0000-0000-000000000001', 1,
  '[{"x0":40,"y0":500,"x1":550,"y1":700,"pos":0,"topic_id":"70000000-0000-0000-0000-000000000001"},{"x0":40,"y0":300,"x1":550,"y1":490,"pos":1,"topic_id":null}]'::jsonb)::text $q$); commit;
select count(*) as rows, bool_and(created_by='00000000-0000-0000-0000-0000000000c1') as created_by_ok from public.questions;
\echo '--- 1b. in_charge B saves page 1 of bankB'
begin; select pg_temp.as_user('00000000-0000-0000-0000-0000000000c2', $q$ select public.save_page_crops('22222222-0000-0000-0000-000000000001', 1, '[{"x0":1,"y0":1,"x1":100,"y1":100,"pos":0,"topic_id":"70000000-0000-0000-0000-000000000002"}]'::jsonb)::text $q$); commit;

\echo '--- 2. questions | sources(course A) | topics, per role (expect admin 3|bank=2|2, icA 2|bank=2|1, tA 2|bank=2|1, sA 0|-|0, icB 1|-|1, tB 1|-|1)'
begin;
select who, pg_temp.as_user(uid, 'select (select count(*) from public.questions)||'' | ''||(select coalesce(string_agg(file_name||''=''||questions||'' teacher_only=''||eff_teacher_only, '',''),''-'') from public.question_sources where course_id=''aaaaaaaa-0000-0000-0000-000000000001'')||'' | topics ''||(select count(*) from public.question_topics)') as seen
from (values ('admin','00000000-0000-0000-0000-0000000000a1'::uuid),('in_charge A','00000000-0000-0000-0000-0000000000c1'),('teacher A','00000000-0000-0000-0000-0000000000e1'),('student A','00000000-0000-0000-0000-0000000000f1'),('in_charge B','00000000-0000-0000-0000-0000000000c2'),('teacher B','00000000-0000-0000-0000-0000000000e2')) v(who,uid);
commit;
\echo '--- 2b. anon (expect permission denied x3)'
begin; set local role anon; select count(*) from public.questions; rollback;
begin; set local role anon; select count(*) from public.question_sources; rollback;
begin; set local role anon; select count(*) from public.question_topics; rollback;

\echo '--- 3. can_crop_file: bank.pdf per role (expect admin t, icA t, tA f, sA f, icB f); open.pdf as icA (expect f: students can see it)'
begin;
select who, pg_temp.as_user(uid, 'select public.can_crop_file(''11111111-0000-0000-0000-000000000001'')::text') from (values ('admin','00000000-0000-0000-0000-0000000000a1'::uuid),('in_charge A','00000000-0000-0000-0000-0000000000c1'),('teacher A','00000000-0000-0000-0000-0000000000e1'),('student A','00000000-0000-0000-0000-0000000000f1'),('in_charge B','00000000-0000-0000-0000-0000000000c2')) v(who,uid);
select 'open.pdf as icA' who, pg_temp.as_user('00000000-0000-0000-0000-0000000000c1', 'select public.can_crop_file(''11111111-0000-0000-0000-000000000002'')::text');
commit;

\echo '--- 4. refusals (expect ERR, or 0 rows)'
begin;
select 'teacher A inserts' t, pg_temp.as_user('00000000-0000-0000-0000-0000000000e1', $q$ insert into public.questions (file_id,page,x0,y0,x1,y1) values ('11111111-0000-0000-0000-000000000001',1,1,1,2,2) returning 'INSERTED' $q$)
union all select 'student A inserts', pg_temp.as_user('00000000-0000-0000-0000-0000000000f1', $q$ insert into public.questions (file_id,page,x0,y0,x1,y1) values ('11111111-0000-0000-0000-000000000001',1,1,1,2,2) returning 'INSERTED' $q$)
union all select 'teacher A save_page_crops', pg_temp.as_user('00000000-0000-0000-0000-0000000000e1', $q$ select public.save_page_crops('11111111-0000-0000-0000-000000000001',2,'[{"x0":1,"y0":1,"x1":2,"y1":2,"pos":0,"topic_id":null}]')::text $q$)
union all select 'in_charge B inserts on A file', pg_temp.as_user('00000000-0000-0000-0000-0000000000c2', $q$ insert into public.questions (file_id,page,x0,y0,x1,y1) values ('11111111-0000-0000-0000-000000000001',1,1,1,2,2) returning 'INSERTED' $q$)
union all select 'in_charge A crops student-visible open.pdf', pg_temp.as_user('00000000-0000-0000-0000-0000000000c1', $q$ insert into public.questions (file_id,page,x0,y0,x1,y1) values ('11111111-0000-0000-0000-000000000002',1,1,1,2,2) returning 'INSERTED' $q$)
union all select 'in_charge A tags with course B topic', pg_temp.as_user('00000000-0000-0000-0000-0000000000c1', $q$ insert into public.questions (file_id,page,x0,y0,x1,y1,topic_id) values ('11111111-0000-0000-0000-000000000001',1,1,1,2,2,'70000000-0000-0000-0000-000000000002') returning 'INSERTED' $q$)
union all select 'in_charge A retags to course B topic', pg_temp.as_user('00000000-0000-0000-0000-0000000000c1', $q$ update public.questions set topic_id='70000000-0000-0000-0000-000000000002' where pos=0 and file_id='11111111-0000-0000-0000-000000000001' returning 'UPDATED' $q$)
union all select 'in_charge A forges created_by', pg_temp.as_user('00000000-0000-0000-0000-0000000000c1', $q$ insert into public.questions (file_id,page,x0,y0,x1,y1,created_by) values ('11111111-0000-0000-0000-000000000001',1,1,1,2,2,'00000000-0000-0000-0000-0000000000e1') returning 'INSERTED' $q$)
union all select 'in_charge A NaN box', pg_temp.as_user('00000000-0000-0000-0000-0000000000c1', $q$ insert into public.questions (file_id,page,x0,y0,x1,y1) values ('11111111-0000-0000-0000-000000000001',1,1,1,'NaN',2) returning 'INSERTED' $q$)
union all select 'in_charge A NaN x0', pg_temp.as_user('00000000-0000-0000-0000-0000000000c1', $q$ insert into public.questions (file_id,page,x0,y0,x1,y1) values ('11111111-0000-0000-0000-000000000001',1,'NaN',1,2,2) returning 'INSERTED' $q$)
union all select 'in_charge A inverted box', pg_temp.as_user('00000000-0000-0000-0000-0000000000c1', $q$ insert into public.questions (file_id,page,x0,y0,x1,y1) values ('11111111-0000-0000-0000-000000000001',1,5,1,2,2) returning 'INSERTED' $q$)
union all select 'in_charge A page 0', pg_temp.as_user('00000000-0000-0000-0000-0000000000c1', $q$ insert into public.questions (file_id,page,x0,y0,x1,y1) values ('11111111-0000-0000-0000-000000000001',0,1,1,2,2) returning 'INSERTED' $q$)
union all select 'in_charge A moves crop to another file', pg_temp.as_user('00000000-0000-0000-0000-0000000000c1', $q$ update public.questions set file_id='11111111-0000-0000-0000-000000000002' where pos=0 returning 'UPDATED' $q$)
union all select 'in_charge A changes page', pg_temp.as_user('00000000-0000-0000-0000-0000000000c1', $q$ update public.questions set page=3 where pos=0 returning 'UPDATED' $q$)
union all select 'teacher A retopics', pg_temp.as_user('00000000-0000-0000-0000-0000000000e1', $q$ with u as (update public.questions set topic_id=null where pos=0 returning 1) select count(*)||' rows updated' from u $q$)
union all select 'teacher A deletes', pg_temp.as_user('00000000-0000-0000-0000-0000000000e1', $q$ with d as (delete from public.questions returning 1) select count(*)||' rows deleted' from d $q$)
union all select 'in_charge B deletes A crops', pg_temp.as_user('00000000-0000-0000-0000-0000000000c2', $q$ with d as (delete from public.questions where file_id='11111111-0000-0000-0000-000000000001' returning 1) select count(*)||' rows deleted' from d $q$);
rollback;

\echo '--- 5. save_page_crops is all or nothing (expect ERR and still 2 crops on bank.pdf each time)'
begin;
select 'add 1 + edit a crop on another page' t, pg_temp.as_user('00000000-0000-0000-0000-0000000000c1', format($q$ select public.save_page_crops('11111111-0000-0000-0000-000000000001', 2, '[{"x0":1,"y0":1,"x1":9,"y1":9,"pos":0,"topic_id":null}]', jsonb_build_array(jsonb_build_object('id','%s','x0',1,'y0',1,'x1',9,'y1',9,'pos',0,'topic_id',null)))::text $q$, (select id from public.questions where file_id='11111111-0000-0000-0000-000000000001' and pos=0)))
union all select 'add 1 + remove course B crop', pg_temp.as_user('00000000-0000-0000-0000-0000000000c1', format($q$ select public.save_page_crops('11111111-0000-0000-0000-000000000001', 1, '[{"x0":1,"y0":1,"x1":9,"y1":9,"pos":2,"topic_id":null}]', '[]', array['%s']::uuid[])::text $q$, (select id from public.questions where file_id='22222222-0000-0000-0000-000000000001')))
union all select 'add 1 good + 1 inverted', pg_temp.as_user('00000000-0000-0000-0000-0000000000c1', $q$ select public.save_page_crops('11111111-0000-0000-0000-000000000001', 1, '[{"x0":1,"y0":1,"x1":9,"y1":9,"pos":2,"topic_id":null},{"x0":9,"y0":1,"x1":1,"y1":9,"pos":3,"topic_id":null}]')::text $q$);
select count(*) as bank_crops_after_failures from public.questions where file_id='11111111-0000-0000-0000-000000000001';
rollback;

\echo '--- 6. allowed: in_charge A edits box/pos/topic and removes, through save_page_crops (expect empty result, then 1 crop with x0=30 pos=0 no topic)'
begin;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1', format($q$ select public.save_page_crops('11111111-0000-0000-0000-000000000001', 1, '[]', jsonb_build_array(jsonb_build_object('id','%s','x0',30,'y0',500,'x1',550,'y1',700,'pos',0,'topic_id',null)), array['%s']::uuid[])::text $q$,
  (select id from public.questions where file_id='11111111-0000-0000-0000-000000000001' and pos=0),
  (select id from public.questions where file_id='11111111-0000-0000-0000-000000000001' and pos=1)));
select x0, pos, topic_id from public.questions where file_id='11111111-0000-0000-0000-000000000001';
rollback;

\echo '--- 7. trash bank.pdf as in_charge A; counts; insert refused; restore'
begin; select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1', $q$ select public.soft_delete_file('11111111-0000-0000-0000-000000000001')::text $q$) is not null as trashed; commit;
begin;
select who, pg_temp.as_user(uid, 'select (select count(*) from public.questions where file_id=''11111111-0000-0000-0000-000000000001'')||'' | sources ''||(select count(*) from public.question_sources where course_id=''aaaaaaaa-0000-0000-0000-000000000001'')||'' | can_crop ''||public.can_crop_file(''11111111-0000-0000-0000-000000000001'')') from (values ('in_charge A','00000000-0000-0000-0000-0000000000c1'::uuid),('teacher A','00000000-0000-0000-0000-0000000000e1'),('admin','00000000-0000-0000-0000-0000000000a1')) v(who,uid);
select 'in_charge A crops trashed file' t, pg_temp.as_user('00000000-0000-0000-0000-0000000000c1', $q$ insert into public.questions (file_id,page,x0,y0,x1,y1) values ('11111111-0000-0000-0000-000000000001',3,1,1,2,2) returning 'INSERTED' $q$);
commit;
begin; select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1', $q$ select public.restore_batch((select delete_batch_id from public.files where id='11111111-0000-0000-0000-000000000001'))::text $q$); commit;
begin; select 'teacher A after restore' who, pg_temp.as_user('00000000-0000-0000-0000-0000000000e1', 'select count(*)::text from public.questions'); commit;

\echo '--- 8. Banks folder made student-visible: crops stay readable by teachers, sources says so, cropping refused'
begin;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1', $q$ with u as (update public.folders set teacher_only=false where id='f0000000-0000-0000-0000-000000000001' returning 1) select count(*)||' folder updated' from u $q$);
select 'teacher A' who, pg_temp.as_user('00000000-0000-0000-0000-0000000000e1', 'select (select count(*) from public.questions where file_id=''11111111-0000-0000-0000-000000000001'')||'' | ''||(select string_agg(file_name||'' teacher_only=''||eff_teacher_only, '','') from public.question_sources where course_id=''aaaaaaaa-0000-0000-0000-000000000001'')');
select 'in_charge A can_crop' who, pg_temp.as_user('00000000-0000-0000-0000-0000000000c1', 'select public.can_crop_file(''11111111-0000-0000-0000-000000000001'')::text');
select 'in_charge A deletes a crop' who, pg_temp.as_user('00000000-0000-0000-0000-0000000000c1', $q$ with d as (delete from public.questions where file_id='11111111-0000-0000-0000-000000000001' returning 1) select count(*)||' rows deleted' from d $q$);
rollback;

\echo '--- 9. purge-style hard delete of the file, and of its folder (expect 1 left: course B)'
begin; delete from public.files where id='11111111-0000-0000-0000-000000000001'; select count(*) as questions_left_total from public.questions; rollback;
begin; delete from public.folders where id='f0000000-0000-0000-0000-000000000001'; select count(*) as questions_left_after_folder from public.questions; rollback;
\echo '--- 9b. topic deleted -> topic_id null; course deleted -> its topics go'
begin; delete from public.question_topics where id='70000000-0000-0000-0000-000000000001'; select count(*) filter (where topic_id is not null) as tagged_left from public.questions; rollback;
begin; delete from public.courses where id='bbbbbbbb-0000-0000-0000-000000000001'; select count(*) as topics_left from public.question_topics; rollback;

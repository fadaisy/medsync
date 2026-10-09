\set ON_ERROR_STOP 0
create extension if not exists pgcrypto;
create schema app; create schema auth;
create function app.current_hospital_id() returns uuid language sql stable as $$ select '00000000-0000-0000-0000-0000000000a1'::uuid $$;
create function app.has_clinical_relationship(p uuid) returns boolean language sql stable as $$ select true $$;
create function app.can_view_classes(c text[]) returns boolean language sql stable as $$ select c <@ string_to_array(coalesce(current_setting('test.classes', true), ''), ',') $$;
create function auth.uid() returns uuid language sql stable as $$ select '00000000-0000-0000-0000-000000000aa1'::uuid $$;
create function app.audit_row() returns trigger language plpgsql as $$ begin return null; end $$;
create table conditions_current (logical_id uuid primary key, patient_id uuid, hospital_id uuid, verification text, restricted_class text, name text);
\i ddl.sql
-- fixtures
insert into conditions_current values
 ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000b01','00000000-0000-0000-0000-0000000000a1','confirmed',null,'anaemia'),
 ('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000b01','00000000-0000-0000-0000-0000000000a1','confirmed',null,'malaria'),
 ('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000b01','00000000-0000-0000-0000-0000000000a1','differential',null,'sepsis?'),
 ('00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000b01','00000000-0000-0000-0000-0000000000a1','confirmed','hiv','hiv'),
 ('00000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000b01','00000000-0000-0000-0000-0000000000a1','confirmed',null,'c5'),
 ('00000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000b01','00000000-0000-0000-0000-0000000000a1','confirmed',null,'c6'),
 ('00000000-0000-0000-0000-000000000007','00000000-0000-0000-0000-000000000b01','00000000-0000-0000-0000-0000000000a1','confirmed',null,'c7'),
 ('00000000-0000-0000-0000-000000000008','00000000-0000-0000-0000-000000000b02','00000000-0000-0000-0000-0000000000a1','confirmed',null,'other patient');
create function t_ins(c text, r text, typ text, lab text) returns text language plpgsql as $$
begin
  insert into condition_relations (relation_id, version, hospital_id, patient_id, encounter_id, condition_id, related_condition_id, relation_type, label, origin, asserted_by)
  values (gen_random_uuid(), 1, '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000b01', gen_random_uuid(),
          ('00000000-0000-0000-0000-00000000000'||c)::uuid, ('00000000-0000-0000-0000-00000000000'||r)::uuid, typ::condition_relation_type, lab::condition_relation_label, 'clinician', auth.uid());
  return 'ok';
exception when others then return 'REFUSED: '||sqlerrm;
end $$;
select '1 anaemia due_to malaria' t, t_ins('1','2','due_to','secondary');
select '2 self' t, t_ins('1','1','due_to','secondary');
select '3 to a differential' t, t_ins('1','3','due_to','secondary');
select '4 due_to without label' t, t_ins('5','6','due_to',null);
select '5 loop malaria due_to anaemia' t, t_ins('2','1','due_to','secondary');
select '6 anaemia due_to hiv (restricted)' t, t_ins('1','4','due_to','secondary');
select '7 chain 5<-6<-7<-1 (a..d)' t, t_ins('7','1','due_to','secondary'), t_ins('6','7','due_to','secondary');
select '8 fifth level 5<-6' t, t_ins('5','6','due_to','secondary');
select '8b middle link lengthens existing chain (2 due_to 5)' t, t_ins('2','5','due_to','secondary');
select '9 other patient' t, t_ins('1','8','due_to','secondary');
select '10 associated_with wrong order' t, t_ins('2','1','associated_with',null);
select '11 update blocked' t; update condition_relations set position = 2;
select '12 delete blocked' t; delete from condition_relations;
select condition_id, related_condition_id, restricted_classes from condition_relations order by asserted_at;
-- RLS as a non-superuser
drop role if exists clin; create role clin login; grant usage on schema app, auth to clin; grant select, insert on condition_relations to clin; grant select on conditions_current to clin;
grant execute on all functions in schema app, auth to clin;
set role clin;
set test.classes = '';
select 'rows visible without hiv class' t, count(*) from condition_relations;
set test.classes = 'hiv';
select 'rows visible with hiv class' t, count(*) from condition_relations;
reset role;

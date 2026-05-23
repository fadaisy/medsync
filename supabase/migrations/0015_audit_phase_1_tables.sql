-- 0015 — attach the public.audit_log_changes() trigger to every Phase 1
-- onboarding table that wasn't covered by 0003.
--
-- 0003 wired audit on: users, hospitals, hospital_departments,
-- user_roles, consent_records. The Phase 1 additions need the same
-- treatment so approve/reject decisions, profile edits, and lifecycle
-- transitions land in audit_log alongside the rest.
--
-- Reference data (ref_*) is intentionally NOT audited — it changes
-- via migrations + ref_data_versions, which is its own paper trail.
-- signup_drafts is NOT audited — it's transient form state, not
-- system-of-record. Auditing it would pollute the log with one row
-- per keystroke and add no forensic value.

DROP TRIGGER IF EXISTS clinician_profiles_audit ON public.clinician_profiles;
CREATE TRIGGER clinician_profiles_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.clinician_profiles
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();

DROP TRIGGER IF EXISTS staff_affiliations_audit ON public.staff_affiliations;
CREATE TRIGGER staff_affiliations_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.staff_affiliations
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();

DROP TRIGGER IF EXISTS patient_profiles_audit ON public.patient_profiles;
CREATE TRIGGER patient_profiles_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.patient_profiles
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();

DROP TRIGGER IF EXISTS hospital_applications_audit ON public.hospital_applications;
CREATE TRIGGER hospital_applications_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.hospital_applications
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();

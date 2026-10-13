# NCDSync data inventory

Generated from `db/schema/ncd-registry.ts`, `lib/ncdreg/table-access.ts` and `lib/ncdreg/capabilities.ts` by `npm run ncdreg:docs`. Do not edit by hand.

An input to the data protection impact assessment, not the assessment. *Identifying* columns are the encrypted identifiers (`*_ciphertext`, AES-256-GCM through lib/encryption) and their keyed blind indexes (`*_hmac`). The analytics role (dashboards, indicators) is granted no identifying column. Superadmin holds no NCD role. Every read of an identifiable record is logged in `ncd_access_event` and every write in `audit_log`.

## ncd_access_event

| Column | Type | Identifying | Encrypted | Readable by |
| --- | --- | --- | --- | --- |
| id | bigint | no | no | auditor |
| facility_id | uuid | no | no | auditor |
| user_id | uuid | no | no | auditor |
| principal | text | no | no | auditor |
| action | text | no | no | auditor |
| person_id | uuid | no | no | auditor |
| demo_load_id | uuid | no | no | auditor |
| detail | jsonb | no | no | auditor |
| at | timestamp with time zone | no | no | auditor |

## ncd_appointment

| Column | Type | Identifying | Encrypted | Readable by |
| --- | --- | --- | --- | --- |
| id | uuid | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| facility_id | uuid | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| person_id | uuid | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| appointment_date | date | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| source_visit_id | uuid | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| source_call_id | uuid | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| status | text | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| status_reason | text | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| entered_at | timestamp with time zone | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| updated_at | timestamp with time zone | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |

## ncd_audit_sample

| Column | Type | Identifying | Encrypted | Readable by |
| --- | --- | --- | --- | --- |
| id | uuid | no | no | registry lead, auditor |
| facility_id | uuid | no | no | registry lead, auditor |
| person_id | uuid | no | no | registry lead, auditor |
| visit_id | uuid | no | no | registry lead, auditor |
| month | date | no | no | registry lead, auditor |
| seed | text | no | no | registry lead, auditor |
| field_agreement | jsonb | no | no | registry lead, auditor |
| checked_by | uuid | no | no | registry lead, auditor |
| checked_at | timestamp with time zone | no | no | registry lead, auditor |
| created_at | timestamp with time zone | no | no | registry lead, auditor |

## ncd_call

| Column | Type | Identifying | Encrypted | Readable by |
| --- | --- | --- | --- | --- |
| id | uuid | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| facility_id | uuid | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| person_id | uuid | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| appointment_id | uuid | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| call_date | date | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| outcome | text | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| new_appointment_date | date | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| phone_slot | integer | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| principal | text | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| entered_by | uuid | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| entered_by_label | text | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| entered_at | timestamp with time zone | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |

## ncd_capability_grant

| Column | Type | Identifying | Encrypted | Readable by |
| --- | --- | --- | --- | --- |
| role | text | no | no | – |
| capability | text | no | no | – |

## ncd_command_log

| Column | Type | Identifying | Encrypted | Readable by |
| --- | --- | --- | --- | --- |
| command_id | uuid | no | no | triage nurse, clinician, registry officer, registry lead, auditor |
| facility_id | uuid | no | no | triage nurse, clinician, registry officer, registry lead, auditor |
| person_id | uuid | no | no | triage nurse, clinician, registry officer, registry lead, auditor |
| type | text | no | no | triage nurse, clinician, registry officer, registry lead, auditor |
| principal | text | no | no | triage nurse, clinician, registry officer, registry lead, auditor |
| user_id | uuid | no | no | triage nurse, clinician, registry officer, registry lead, auditor |
| client_ts | timestamp with time zone | no | no | triage nurse, clinician, registry officer, registry lead, auditor |
| entered_at | timestamp with time zone | no | no | triage nurse, clinician, registry officer, registry lead, auditor |
| result | jsonb | no | no | triage nurse, clinician, registry officer, registry lead, auditor |
| demo_load_id | uuid | no | no | triage nurse, clinician, registry officer, registry lead, auditor |
| created_at | timestamp with time zone | no | no | triage nurse, clinician, registry officer, registry lead, auditor |

## ncd_condition_setting

| Column | Type | Identifying | Encrypted | Readable by |
| --- | --- | --- | --- | --- |
| id | uuid | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator, auditor, clinical safety officer |
| facility_id | uuid | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator, auditor, clinical safety officer |
| condition_code | text | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator, auditor, clinical safety officer |
| enabled | boolean | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator, auditor, clinical safety officer |
| module_level | text | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator, auditor, clinical safety officer |
| module_status | text | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator, auditor, clinical safety officer |
| module_version | text | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator, auditor, clinical safety officer |
| version | integer | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator, auditor, clinical safety officer |
| reason | text | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator, auditor, clinical safety officer |
| demo_load_id | uuid | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator, auditor, clinical safety officer |
| set_by | uuid | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator, auditor, clinical safety officer |
| set_at | timestamp with time zone | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator, auditor, clinical safety officer |

## ncd_definition_version

| Column | Type | Identifying | Encrypted | Readable by |
| --- | --- | --- | --- | --- |
| id | uuid | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator, auditor, clinical safety officer |
| facility_id | uuid | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator, auditor, clinical safety officer |
| definition_id | text | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator, auditor, clinical safety officer |
| version | text | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator, auditor, clinical safety officer |
| payload | jsonb | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator, auditor, clinical safety officer |
| status | text | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator, auditor, clinical safety officer |
| author | uuid | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator, auditor, clinical safety officer |
| approver | uuid | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator, auditor, clinical safety officer |
| decided_at | timestamp with time zone | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator, auditor, clinical safety officer |
| created_at | timestamp with time zone | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator, auditor, clinical safety officer |

## ncd_demo_load

| Column | Type | Identifying | Encrypted | Readable by |
| --- | --- | --- | --- | --- |
| id | uuid | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator, auditor, clinical safety officer |
| facility_id | uuid | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator, auditor, clinical safety officer |
| mode | text | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator, auditor, clinical safety officer |
| catalogue_version | text | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator, auditor, clinical safety officer |
| seed | integer | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator, auditor, clinical safety officer |
| day0 | date | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator, auditor, clinical safety officer |
| status | text | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator, auditor, clinical safety officer |
| progress | jsonb | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator, auditor, clinical safety officer |
| previous_condition_settings | jsonb | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator, auditor, clinical safety officer |
| counts | jsonb | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator, auditor, clinical safety officer |
| started_by | uuid | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator, auditor, clinical safety officer |
| started_at | timestamp with time zone | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator, auditor, clinical safety officer |
| ended_by | uuid | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator, auditor, clinical safety officer |
| ended_at | timestamp with time zone | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator, auditor, clinical safety officer |

## ncd_event

| Column | Type | Identifying | Encrypted | Readable by |
| --- | --- | --- | --- | --- |
| id | uuid | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| facility_id | uuid | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| person_id | uuid | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| event_type | text | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| event_date | date | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| date_estimated | boolean | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| reporting_unit | text | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| admission_reason | text | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| death_place | text | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| death_cause_ciphertext | text | yes | yes | triage nurse, clinician, registry officer, registry lead |
| death_source | text | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| transfer_destination_ciphertext | text | yes | yes | triage nurse, clinician, registry officer, registry lead |
| is_invalid | boolean | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| principal | text | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| entered_by | uuid | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| entered_by_label | text | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| entered_at | timestamp with time zone | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| version | integer | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| updated_at | timestamp with time zone | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |

## ncd_export_request

| Column | Type | Identifying | Encrypted | Readable by |
| --- | --- | --- | --- | --- |
| id | uuid | no | no | registry officer, registry lead, head of department, administrator, auditor |
| facility_id | uuid | no | no | registry officer, registry lead, head of department, administrator, auditor |
| kind | text | no | no | registry officer, registry lead, head of department, administrator, auditor |
| status | text | no | no | registry officer, registry lead, head of department, administrator, auditor |
| approval_reference | text | no | no | registry officer, registry lead, head of department, administrator, auditor |
| requested_by | uuid | no | no | registry officer, registry lead, head of department, administrator, auditor |
| requested_at | timestamp with time zone | no | no | registry officer, registry lead, head of department, administrator, auditor |
| approved_by | uuid | no | no | registry officer, registry lead, head of department, administrator, auditor |
| approved_at | timestamp with time zone | no | no | registry officer, registry lead, head of department, administrator, auditor |
| released_at | timestamp with time zone | no | no | registry officer, registry lead, head of department, administrator, auditor |
| detail | jsonb | no | no | registry officer, registry lead, head of department, administrator, auditor |

## ncd_facility_settings

| Column | Type | Identifying | Encrypted | Readable by |
| --- | --- | --- | --- | --- |
| facility_id | uuid | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator, auditor, clinical safety officer |
| time_zone | text | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator, auditor, clinical safety officer |
| glucose_unit | text | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator, auditor, clinical safety officer |
| creatinine_unit | text | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator, auditor, clinical safety officer |
| reminder_before_days | integer | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator, auditor, clinical safety officer |
| reminder_after_days | integer | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator, auditor, clinical safety officer |
| reminder_max_missed | integer | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator, auditor, clinical safety officer |
| send_window_start | time | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator, auditor, clinical safety officer |
| send_window_end | time | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator, auditor, clinical safety officer |
| default_interval_weeks | integer[] | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator, auditor, clinical safety officer |
| live_sms_enabled | boolean | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator, auditor, clinical safety officer |
| hospital_display_name | text | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator, auditor, clinical safety officer |
| clinic_phone | text | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator, auditor, clinical safety officer |
| version | integer | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator, auditor, clinical safety officer |
| updated_by | uuid | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator, auditor, clinical safety officer |
| updated_at | timestamp with time zone | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator, auditor, clinical safety officer |

## ncd_go_live_request

| Column | Type | Identifying | Encrypted | Readable by |
| --- | --- | --- | --- | --- |
| id | uuid | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator, auditor, clinical safety officer |
| facility_id | uuid | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator, auditor, clinical safety officer |
| status | text | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator, auditor, clinical safety officer |
| note | text | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator, auditor, clinical safety officer |
| requested_by | uuid | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator, auditor, clinical safety officer |
| requested_at | timestamp with time zone | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator, auditor, clinical safety officer |
| decided_by | uuid | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator, auditor, clinical safety officer |
| decided_at | timestamp with time zone | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator, auditor, clinical safety officer |

## ncd_indicator_snapshot

| Column | Type | Identifying | Encrypted | Readable by |
| --- | --- | --- | --- | --- |
| id | uuid | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| facility_id | uuid | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| month | date | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| definition_version | text | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| results | jsonb | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| is_synthetic | boolean | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| demo_load_id | uuid | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| computed_at | timestamp with time zone | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| signed_by | uuid | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| signed_at | timestamp with time zone | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |

## ncd_merge_request

| Column | Type | Identifying | Encrypted | Readable by |
| --- | --- | --- | --- | --- |
| id | uuid | no | no | registry officer, registry lead, auditor |
| facility_id | uuid | no | no | registry officer, registry lead, auditor |
| person_id | uuid | no | no | registry officer, registry lead, auditor |
| loser_person_id | uuid | no | no | registry officer, registry lead, auditor |
| reason | text | no | no | registry officer, registry lead, auditor |
| status | text | no | no | registry officer, registry lead, auditor |
| requested_by | uuid | no | no | registry officer, registry lead, auditor |
| requested_at | timestamp with time zone | no | no | registry officer, registry lead, auditor |
| decided_by | uuid | no | no | registry officer, registry lead, auditor |
| decided_at | timestamp with time zone | no | no | registry officer, registry lead, auditor |

## ncd_name_index

| Column | Type | Identifying | Encrypted | Readable by |
| --- | --- | --- | --- | --- |
| id | uuid | no | no | triage nurse, clinician, registry officer, registry lead |
| facility_id | uuid | no | no | triage nurse, clinician, registry officer, registry lead |
| person_id | uuid | no | no | triage nurse, clinician, registry officer, registry lead |
| token_hmac | text | yes | no | triage nurse, clinician, registry officer, registry lead |

## ncd_observation

| Column | Type | Identifying | Encrypted | Readable by |
| --- | --- | --- | --- | --- |
| id | uuid | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| facility_id | uuid | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| person_id | uuid | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| visit_id | uuid | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| registration_id | uuid | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| code | text | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| value_text | text | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| value_num | numeric | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| entered_at | timestamp with time zone | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |

## ncd_person

| Column | Type | Identifying | Encrypted | Readable by |
| --- | --- | --- | --- | --- |
| id | uuid | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| facility_id | uuid | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| registry_number | text | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| is_synthetic | boolean | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| demo_load_id | uuid | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| hospital_number_ciphertext | text | yes | yes | triage nurse, clinician, registry officer, registry lead |
| hospital_number_hmac | text | yes | no | triage nurse, clinician, registry officer, registry lead |
| national_id_ciphertext | text | yes | yes | triage nurse, clinician, registry officer, registry lead |
| national_id_hmac | text | yes | no | triage nurse, clinician, registry officer, registry lead |
| given_name_ciphertext | text | yes | yes | triage nurse, clinician, registry officer, registry lead |
| family_name_ciphertext | text | yes | yes | triage nurse, clinician, registry officer, registry lead |
| sex | text | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| date_of_birth | date | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| birth_year | integer | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| dob_estimated | boolean | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| phone1_ciphertext | text | yes | yes | triage nurse, clinician, registry officer, registry lead |
| phone1_hmac | text | yes | no | triage nurse, clinician, registry officer, registry lead |
| phone1_invalid | boolean | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| phone2_ciphertext | text | yes | yes | triage nurse, clinician, registry officer, registry lead |
| phone2_hmac | text | yes | no | triage nurse, clinician, registry officer, registry lead |
| phone2_invalid | boolean | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| has_valid_phone | boolean | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| nok_name_ciphertext | text | yes | yes | triage nurse, clinician, registry officer, registry lead |
| nok_phone_ciphertext | text | yes | yes | triage nurse, clinician, registry officer, registry lead |
| district_code | text | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| district_name | text | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| subcounty_code | text | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| subcounty_name | text | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| parish_ciphertext | text | yes | yes | triage nurse, clinician, registry officer, registry lead |
| village_ciphertext | text | yes | yes | triage nurse, clinician, registry officer, registry lead |
| sms_allowed | boolean | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| calls_allowed | boolean | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| sms_opted_out_at | timestamp with time zone | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| privacy_notice_version | text | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| privacy_notice_ack_at | timestamp with time zone | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| height_cm | numeric(5, 1) | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| tobacco | text | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| alcohol | text | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| known_cvd | text[] | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| known_kidney_disease | boolean | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| family_history_diabetes | boolean | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| family_history_hypertension | boolean | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| recall_removed_at | timestamp with time zone | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| merged_into_id | uuid | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| merged_at | timestamp with time zone | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| patient_user_id | uuid | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| provisional_patient_id | uuid | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| principal | text | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| entered_by | uuid | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| entered_by_label | text | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| entered_at | timestamp with time zone | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| version | integer | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| updated_at | timestamp with time zone | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |

## ncd_query

| Column | Type | Identifying | Encrypted | Readable by |
| --- | --- | --- | --- | --- |
| id | uuid | no | no | registry lead, auditor |
| facility_id | uuid | no | no | registry lead, auditor |
| person_id | uuid | no | no | registry lead, auditor |
| rule_id | text | no | no | registry lead, auditor |
| status | text | no | no | registry lead, auditor |
| detail | jsonb | no | no | registry lead, auditor |
| resolution_note | text | no | no | registry lead, auditor |
| created_at | timestamp with time zone | no | no | registry lead, auditor |
| resolved_by | uuid | no | no | registry lead, auditor |
| resolved_at | timestamp with time zone | no | no | registry lead, auditor |

## ncd_record_version

| Column | Type | Identifying | Encrypted | Readable by |
| --- | --- | --- | --- | --- |
| id | uuid | no | no | clinician, registry lead, head of department, auditor |
| facility_id | uuid | no | no | clinician, registry lead, head of department, auditor |
| person_id | uuid | no | no | clinician, registry lead, head of department, auditor |
| record_table | text | no | no | clinician, registry lead, head of department, auditor |
| record_id | uuid | no | no | clinician, registry lead, head of department, auditor |
| version | integer | no | no | clinician, registry lead, head of department, auditor |
| data | jsonb | no | no | clinician, registry lead, head of department, auditor |
| reason | text | no | no | clinician, registry lead, head of department, auditor |
| changed_by | uuid | no | no | clinician, registry lead, head of department, auditor |
| changed_at | timestamp with time zone | no | no | clinician, registry lead, head of department, auditor |

## ncd_registration

| Column | Type | Identifying | Encrypted | Readable by |
| --- | --- | --- | --- | --- |
| id | uuid | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| facility_id | uuid | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| person_id | uuid | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| condition_code | text | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| subtype | text | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| registration_date | date | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| diagnosis_year | integer | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| diagnosis_month | integer | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| basis_of_diagnosis | text | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| where_first_diagnosed | text | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| referral_source | text | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| is_historical | boolean | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| superseded_by_id | uuid | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| principal | text | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| entered_by | uuid | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| entered_by_label | text | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| entered_at | timestamp with time zone | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| version | integer | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| updated_at | timestamp with time zone | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |

## ncd_registry_counter

| Column | Type | Identifying | Encrypted | Readable by |
| --- | --- | --- | --- | --- |
| facility_id | uuid | no | no | – |
| next_value | integer | no | no | – |

## ncd_reminder

| Column | Type | Identifying | Encrypted | Readable by |
| --- | --- | --- | --- | --- |
| id | uuid | no | no | triage nurse, clinician, registry officer, registry lead, auditor |
| facility_id | uuid | no | no | triage nurse, clinician, registry officer, registry lead, auditor |
| person_id | uuid | no | no | triage nurse, clinician, registry officer, registry lead, auditor |
| appointment_id | uuid | no | no | triage nurse, clinician, registry officer, registry lead, auditor |
| kind | text | no | no | triage nurse, clinician, registry officer, registry lead, auditor |
| seq | integer | no | no | triage nurse, clinician, registry officer, registry lead, auditor |
| due_on | date | no | no | triage nurse, clinician, registry officer, registry lead, auditor |
| status | text | no | no | triage nurse, clinician, registry officer, registry lead, auditor |
| status_reason | text | no | no | triage nurse, clinician, registry officer, registry lead, auditor |
| decided_at | timestamp with time zone | no | no | triage nurse, clinician, registry officer, registry lead, auditor |
| created_at | timestamp with time zone | no | no | triage nurse, clinician, registry officer, registry lead, auditor |

## ncd_review

| Column | Type | Identifying | Encrypted | Readable by |
| --- | --- | --- | --- | --- |
| id | uuid | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| facility_id | uuid | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| person_id | uuid | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| component | text | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| review_date | date | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| data | jsonb | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| derived | jsonb | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| is_historical | boolean | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| is_invalid | boolean | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| principal | text | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| entered_by | uuid | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| entered_by_label | text | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| entered_at | timestamp with time zone | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| version | integer | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| updated_at | timestamp with time zone | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |

## ncd_sms_log

| Column | Type | Identifying | Encrypted | Readable by |
| --- | --- | --- | --- | --- |
| id | uuid | no | no | registry officer, registry lead, auditor |
| facility_id | uuid | no | no | registry officer, registry lead, auditor |
| person_id | uuid | no | no | registry officer, registry lead, auditor |
| reminder_id | uuid | no | no | registry officer, registry lead, auditor |
| to_hmac | text | yes | no | registry officer, registry lead, auditor |
| body | text | no | no | registry officer, registry lead, auditor |
| transport | text | no | no | registry officer, registry lead, auditor |
| result | text | no | no | registry officer, registry lead, auditor |
| reason | text | no | no | registry officer, registry lead, auditor |
| created_at | timestamp with time zone | no | no | registry officer, registry lead, auditor |

## ncd_sms_template

| Column | Type | Identifying | Encrypted | Readable by |
| --- | --- | --- | --- | --- |
| id | uuid | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator, auditor, clinical safety officer |
| facility_id | uuid | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator, auditor, clinical safety officer |
| purpose | text | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator, auditor, clinical safety officer |
| language | text | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator, auditor, clinical safety officer |
| body | text | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator, auditor, clinical safety officer |
| status | text | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator, auditor, clinical safety officer |
| version | integer | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator, auditor, clinical safety officer |
| created_by | uuid | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator, auditor, clinical safety officer |
| first_approver | uuid | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator, auditor, clinical safety officer |
| approved_by | uuid | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator, auditor, clinical safety officer |
| approved_at | timestamp with time zone | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator, auditor, clinical safety officer |
| created_at | timestamp with time zone | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator, auditor, clinical safety officer |

## ncd_staff_role

| Column | Type | Identifying | Encrypted | Readable by |
| --- | --- | --- | --- | --- |
| id | uuid | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator, auditor, clinical safety officer |
| facility_id | uuid | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator, auditor, clinical safety officer |
| user_id | uuid | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator, auditor, clinical safety officer |
| ncd_role | text | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator, auditor, clinical safety officer |
| granted_by | uuid | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator, auditor, clinical safety officer |
| granted_at | timestamp with time zone | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator, auditor, clinical safety officer |
| revoked_by | uuid | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator, auditor, clinical safety officer |
| revoked_at | timestamp with time zone | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator, auditor, clinical safety officer |

## ncd_visit

| Column | Type | Identifying | Encrypted | Readable by |
| --- | --- | --- | --- | --- |
| id | uuid | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| facility_id | uuid | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| person_id | uuid | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| appointment_id | uuid | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| visit_date | date | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| visit_type | text | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| is_historical | boolean | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| status | text | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| is_invalid | boolean | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| stage | text | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| arrived_at | timestamp with time zone | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| weight_kg | numeric(5, 1) | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| bp_readings | jsonb | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| visit_systolic | integer | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| visit_diastolic | integer | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| bmi | numeric(4, 1) | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| height_cm_used | numeric(5, 1) | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| bmi_formula | text | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| bp_formula | text | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| glucose_mmol | numeric(4, 1) | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| glucose_original_value | numeric(6, 1) | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| glucose_original_unit | text | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| glucose_type | text | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| glucose_method | text | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| hba1c_percent | numeric(4, 1) | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| hba1c_mmol_mol | integer | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| hba1c_result_date | date | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| lab_refs | jsonb | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| outside_results | jsonb | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| hypoglycaemia | text | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| medicines | text[] | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| medicines_other_ciphertext | text | yes | yes | triage nurse, clinician, registry officer, registry lead |
| medicines_confirmed_unchanged | boolean | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| missed_doses | text | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| medicines_obtained | text | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| not_obtained_reason | text | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| next_appointment_date | date | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| disposition | text | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| nurse_saved_by | uuid | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| nurse_saved_at | timestamp with time zone | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| nurse_saved_label | text | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| clinician_started_by | uuid | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| clinician_started_at | timestamp with time zone | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| clinician_saved_by | uuid | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| clinician_saved_at | timestamp with time zone | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| clinician_saved_label | text | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| closed_by | uuid | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| closed_at | timestamp with time zone | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| principal | text | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| entered_by | uuid | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| entered_at | timestamp with time zone | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| client_ts | timestamp with time zone | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| version | integer | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |
| updated_at | timestamp with time zone | no | no | triage nurse, clinician, registry officer, registry lead, head of department, administrator |

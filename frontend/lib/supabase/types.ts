// Tipos generados a partir del esquema de Supabase (proyecto "SaaS healt").
// Regenerar tras cada migración con:
//   supabase gen types typescript --project-id <id> > lib/supabase/types.ts
// No editar manualmente: este archivo se sobreescribe al regenerar.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      appointment_modifiers: {
        Row: {
          applied_extra_minutes: number
          appointment_id: string
          technology_modifier_id: string
        }
        Insert: {
          applied_extra_minutes: number
          appointment_id: string
          technology_modifier_id: string
        }
        Update: {
          applied_extra_minutes?: number
          appointment_id?: string
          technology_modifier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointment_modifiers_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_modifiers_technology_modifier_id_fkey"
            columns: ["technology_modifier_id"]
            isOneToOne: false
            referencedRelation: "technology_modifiers"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          clinic_id: string
          created_at: string
          deleted_at: string | null
          end_at: string
          google_event_id: string | null
          id: string
          origin: string
          patient_id: string
          phase_template_id: string | null
          professional_id: string
          reason: string | null
          reminder_24h_sent_at: string | null
          reminder_4h_sent_at: string | null
          start_at: string
          status: Database["public"]["Enums"]["appointment_status"]
          treatment_id: string | null
          updated_at: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          deleted_at?: string | null
          end_at: string
          google_event_id?: string | null
          id?: string
          origin?: string
          patient_id: string
          phase_template_id?: string | null
          professional_id: string
          reason?: string | null
          reminder_24h_sent_at?: string | null
          reminder_4h_sent_at?: string | null
          start_at: string
          status?: Database["public"]["Enums"]["appointment_status"]
          treatment_id?: string | null
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          deleted_at?: string | null
          end_at?: string
          google_event_id?: string | null
          id?: string
          origin?: string
          patient_id?: string
          phase_template_id?: string | null
          professional_id?: string
          reason?: string | null
          reminder_24h_sent_at?: string | null
          reminder_4h_sent_at?: string | null
          start_at?: string
          status?: Database["public"]["Enums"]["appointment_status"]
          treatment_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient_risk_profile"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "appointments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_phase_template_id_fkey"
            columns: ["phase_template_id"]
            isOneToOne: false
            referencedRelation: "treatment_phase_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_treatment_id_fkey"
            columns: ["treatment_id"]
            isOneToOne: false
            referencedRelation: "treatments"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          actor_role: string | null
          clinic_id: string | null
          id: number
          new_data: Json | null
          occurred_at: string
          old_data: Json | null
          record_id: string | null
          source: string | null
          table_name: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_role?: string | null
          clinic_id?: string | null
          id?: never
          new_data?: Json | null
          occurred_at?: string
          old_data?: Json | null
          record_id?: string | null
          source?: string | null
          table_name: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_role?: string | null
          clinic_id?: string | null
          id?: never
          new_data?: Json | null
          occurred_at?: string
          old_data?: Json | null
          record_id?: string | null
          source?: string | null
          table_name?: string
        }
        Relationships: []
      }
      availability_exceptions: {
        Row: {
          clinic_id: string
          created_at: string
          deleted_at: string | null
          ends_at: string
          external_event_id: string | null
          id: string
          kind: Database["public"]["Enums"]["availability_exception_kind"]
          professional_id: string
          reason: string | null
          source: string
          starts_at: string
          updated_at: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          deleted_at?: string | null
          ends_at: string
          external_event_id?: string | null
          id?: string
          kind: Database["public"]["Enums"]["availability_exception_kind"]
          professional_id: string
          reason?: string | null
          source?: string
          starts_at: string
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          deleted_at?: string | null
          ends_at?: string
          external_event_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["availability_exception_kind"]
          professional_id?: string
          reason?: string | null
          source?: string
          starts_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "availability_exceptions_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_exceptions_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_specialties: {
        Row: {
          base_off: string[]
          clinic_id: string
          created_at: string
          deleted_at: string | null
          exam_systems: string[]
          id: string
          is_builtin: boolean
          label: string
          slug: string
          sort_order: number
          specialty_fields: string[]
          updated_at: string
        }
        Insert: {
          base_off?: string[]
          clinic_id: string
          created_at?: string
          deleted_at?: string | null
          exam_systems?: string[]
          id?: string
          is_builtin?: boolean
          label: string
          slug: string
          sort_order?: number
          specialty_fields?: string[]
          updated_at?: string
        }
        Update: {
          base_off?: string[]
          clinic_id?: string
          created_at?: string
          deleted_at?: string | null
          exam_systems?: string[]
          id?: string
          is_builtin?: boolean
          label?: string
          slug?: string
          sort_order?: number
          specialty_fields?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinic_specialties_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_specialty_fields: {
        Row: {
          clinic_id: string
          created_at: string
          deleted_at: string | null
          id: string
          key: string
          label: string
          placeholder: string | null
          updated_at: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          key: string
          label: string
          placeholder?: string | null
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          key?: string
          label?: string
          placeholder?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinic_specialty_fields_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      clinical_note_attachments: {
        Row: {
          clinic_id: string
          clinical_note_id: string
          created_at: string
          deleted_at: string | null
          file_name: string
          id: string
          mime_type: string
          size_bytes: number
          storage_path: string
          uploaded_by: string | null
        }
        Insert: {
          clinic_id: string
          clinical_note_id: string
          created_at?: string
          deleted_at?: string | null
          file_name: string
          id?: string
          mime_type: string
          size_bytes: number
          storage_path: string
          uploaded_by?: string | null
        }
        Update: {
          clinic_id?: string
          clinical_note_id?: string
          created_at?: string
          deleted_at?: string | null
          file_name?: string
          id?: string
          mime_type?: string
          size_bytes?: number
          storage_path?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clinical_note_attachments_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinical_note_attachments_clinical_note_id_fkey"
            columns: ["clinical_note_id"]
            isOneToOne: false
            referencedRelation: "clinical_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinical_note_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      clinical_notes: {
        Row: {
          author_id: string
          body: string
          clinic_id: string
          created_at: string
          deleted_at: string | null
          id: string
          note_type: string
          patient_id: string
          structured_data: Json
          treatment_id: string | null
          updated_at: string
        }
        Insert: {
          author_id: string
          body: string
          clinic_id: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          note_type: string
          patient_id: string
          structured_data?: Json
          treatment_id?: string | null
          updated_at?: string
        }
        Update: {
          author_id?: string
          body?: string
          clinic_id?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          note_type?: string
          patient_id?: string
          structured_data?: Json
          treatment_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinical_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinical_notes_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinical_notes_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient_risk_profile"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "clinical_notes_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinical_notes_treatment_id_fkey"
            columns: ["treatment_id"]
            isOneToOne: false
            referencedRelation: "treatments"
            referencedColumns: ["id"]
          },
        ]
      }
      clinics: {
        Row: {
          address: string | null
          auto_confirm_requests: boolean
          created_at: string
          contact_phone: string | null
          currency: string
          default_appointment_minutes: number
          deleted_at: string | null
          id: string
          name: string
          prime_time_end: string
          prime_time_start: string
          timezone: string
          updated_at: string
          valuation_fee: number | null
        }
        Insert: {
          address?: string | null
          auto_confirm_requests?: boolean
          created_at?: string
          contact_phone?: string | null
          currency?: string
          default_appointment_minutes?: number
          deleted_at?: string | null
          id?: string
          name: string
          prime_time_end?: string
          prime_time_start?: string
          timezone?: string
          updated_at?: string
          valuation_fee?: number | null
        }
        Update: {
          address?: string | null
          auto_confirm_requests?: boolean
          created_at?: string
          contact_phone?: string | null
          currency?: string
          default_appointment_minutes?: number
          deleted_at?: string | null
          id?: string
          name?: string
          prime_time_end?: string
          prime_time_start?: string
          timezone?: string
          updated_at?: string
          valuation_fee?: number | null
        }
        Relationships: []
      }
      conversation_messages: {
        Row: {
          clinic_id: string
          content: string | null
          conversation_id: string
          created_at: string
          id: string
          role: string
          tool_calls: Json | null
          wa_message_id: string | null
        }
        Insert: {
          clinic_id: string
          content?: string | null
          conversation_id: string
          created_at?: string
          id?: string
          role: string
          tool_calls?: Json | null
          wa_message_id?: string | null
        }
        Update: {
          clinic_id?: string
          content?: string | null
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
          tool_calls?: Json | null
          wa_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversation_messages_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          clinic_id: string
          contact_phone: string
          context: Json
          created_at: string
          current_intent: string | null
          deleted_at: string | null
          id: string
          last_message_at: string | null
          patient_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          clinic_id: string
          contact_phone: string
          context?: Json
          created_at?: string
          current_intent?: string | null
          deleted_at?: string | null
          id?: string
          last_message_at?: string | null
          patient_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          contact_phone?: string
          context?: Json
          created_at?: string
          current_intent?: string | null
          deleted_at?: string | null
          id?: string
          last_message_at?: string | null
          patient_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient_risk_profile"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "conversations_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_clinical_profile: {
        Row: {
          allergies: string | null
          antecedentes_familiares: string | null
          clinic_id: string
          medical_history: string | null
          patient_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          allergies?: string | null
          antecedentes_familiares?: string | null
          clinic_id: string
          medical_history?: string | null
          patient_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          allergies?: string | null
          antecedentes_familiares?: string | null
          clinic_id?: string
          medical_history?: string | null
          patient_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_clinical_profile_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_clinical_profile_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: true
            referencedRelation: "patient_risk_profile"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "patient_clinical_profile_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: true
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_clinical_profile_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      patients: {
        Row: {
          birth_date: string | null
          clinic_id: string
          created_at: string
          deleted_at: string | null
          email: string | null
          full_name: string
          id: string
          national_id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          birth_date?: string | null
          clinic_id: string
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          full_name: string
          id?: string
          national_id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          birth_date?: string | null
          clinic_id?: string
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          full_name?: string
          id?: string
          national_id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patients_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      professional_availability: {
        Row: {
          clinic_id: string
          created_at: string
          deleted_at: string | null
          effective_from: string
          effective_to: string | null
          end_time: string
          id: string
          professional_id: string
          start_time: string
          updated_at: string
          weekday: number
        }
        Insert: {
          clinic_id: string
          created_at?: string
          deleted_at?: string | null
          effective_from?: string
          effective_to?: string | null
          end_time: string
          id?: string
          professional_id: string
          start_time: string
          updated_at?: string
          weekday: number
        }
        Update: {
          clinic_id?: string
          created_at?: string
          deleted_at?: string | null
          effective_from?: string
          effective_to?: string | null
          end_time?: string
          id?: string
          professional_id?: string
          start_time?: string
          updated_at?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "professional_availability_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professional_availability_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      professional_calendar_links: {
        Row: {
          clinic_id: string
          created_at: string
          deleted_at: string | null
          id: string
          is_active: boolean
          last_synced_at: string | null
          oauth_secret_ref: string | null
          professional_id: string
          provider: string
          source_calendar_id: string | null
          sync_token: string | null
          target_calendar_id: string | null
          updated_at: string
          watch_channel_id: string | null
          watch_expiration: string | null
          watch_resource_id: string | null
          watch_token: string | null
        }
        Insert: {
          clinic_id: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          last_synced_at?: string | null
          oauth_secret_ref?: string | null
          professional_id: string
          provider?: string
          source_calendar_id?: string | null
          sync_token?: string | null
          target_calendar_id?: string | null
          updated_at?: string
          watch_channel_id?: string | null
          watch_expiration?: string | null
          watch_resource_id?: string | null
          watch_token?: string | null
        }
        Update: {
          clinic_id?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          last_synced_at?: string | null
          oauth_secret_ref?: string | null
          professional_id?: string
          provider?: string
          source_calendar_id?: string | null
          sync_token?: string | null
          target_calendar_id?: string | null
          updated_at?: string
          watch_channel_id?: string | null
          watch_expiration?: string | null
          watch_resource_id?: string | null
          watch_token?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "professional_calendar_links_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professional_calendar_links_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: true
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      professionals: {
        Row: {
          clinic_id: string
          created_at: string
          deleted_at: string | null
          id: string
          license_number: string | null
          note_field_config: Json
          prime_time_end: string
          prime_time_start: string
          specialties: string[]
          staff_member_id: string
          updated_at: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          license_number?: string | null
          note_field_config?: Json
          prime_time_end?: string
          prime_time_start?: string
          specialties?: string[]
          staff_member_id: string
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          license_number?: string | null
          note_field_config?: Json
          prime_time_end?: string
          prime_time_start?: string
          specialties?: string[]
          staff_member_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "professionals_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professionals_staff_member_id_fkey"
            columns: ["staff_member_id"]
            isOneToOne: true
            referencedRelation: "staff_members"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_members: {
        Row: {
          auth_user_id: string
          clinic_id: string
          created_at: string
          deleted_at: string | null
          email: string | null
          full_name: string
          id: string
          is_active: boolean
          is_owner: boolean
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          auth_user_id: string
          clinic_id: string
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          full_name: string
          id?: string
          is_active?: boolean
          is_owner?: boolean
          role: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          auth_user_id?: string
          clinic_id?: string
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          is_owner?: boolean
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_members_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      technology_modifiers: {
        Row: {
          clinic_id: string
          created_at: string
          deleted_at: string | null
          extra_minutes: number
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          deleted_at?: string | null
          extra_minutes?: number
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          deleted_at?: string | null
          extra_minutes?: number
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "technology_modifiers_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      treatment_phase_templates: {
        Row: {
          clinic_id: string
          cooldown_days: number
          created_at: string
          deleted_at: string | null
          duration_minutes: number | null
          id: string
          name: string
          phase_kind: Database["public"]["Enums"]["phase_kind"]
          sequence_order: number
          treatment_type_id: string
          updated_at: string
        }
        Insert: {
          clinic_id: string
          cooldown_days?: number
          created_at?: string
          deleted_at?: string | null
          duration_minutes?: number | null
          id?: string
          name: string
          phase_kind: Database["public"]["Enums"]["phase_kind"]
          sequence_order: number
          treatment_type_id: string
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          cooldown_days?: number
          created_at?: string
          deleted_at?: string | null
          duration_minutes?: number | null
          id?: string
          name?: string
          phase_kind?: Database["public"]["Enums"]["phase_kind"]
          sequence_order?: number
          treatment_type_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "treatment_phase_templates_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatment_phase_templates_treatment_type_id_fkey"
            columns: ["treatment_type_id"]
            isOneToOne: false
            referencedRelation: "treatment_types"
            referencedColumns: ["id"]
          },
        ]
      }
      treatment_types: {
        Row: {
          clinic_id: string
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          price_max: number | null
          price_min: number | null
          updated_at: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          price_max?: number | null
          price_min?: number | null
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          price_max?: number | null
          price_min?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "treatment_types_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      treatments: {
        Row: {
          clinic_id: string
          created_at: string
          deleted_at: string | null
          id: string
          patient_id: string
          primary_professional_id: string | null
          status: Database["public"]["Enums"]["treatment_status"]
          treatment_type_id: string
          updated_at: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          patient_id: string
          primary_professional_id?: string | null
          status?: Database["public"]["Enums"]["treatment_status"]
          treatment_type_id: string
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          patient_id?: string
          primary_professional_id?: string | null
          status?: Database["public"]["Enums"]["treatment_status"]
          treatment_type_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "treatments_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient_risk_profile"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "treatments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatments_primary_professional_id_fkey"
            columns: ["primary_professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatments_treatment_type_id_fkey"
            columns: ["treatment_type_id"]
            isOneToOne: false
            referencedRelation: "treatment_types"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_channels: {
        Row: {
          clinic_id: string
          created_at: string
          deleted_at: string | null
          display_number: string | null
          id: string
          is_active: boolean
          phone_number_id: string
          updated_at: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          deleted_at?: string | null
          display_number?: string | null
          id?: string
          is_active?: boolean
          phone_number_id: string
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          deleted_at?: string | null
          display_number?: string | null
          id?: string
          is_active?: boolean
          phone_number_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_channels_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      patient_risk_profile: {
        Row: {
          clinic_id: string | null
          no_show_count: number | null
          patient_id: string | null
          restrict_prime_time: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "patients_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      auth_clinic_id: { Args: never; Returns: string }
      auth_is_owner: { Args: never; Returns: boolean }
      auth_patient_id: { Args: never; Returns: string }
      auth_role: { Args: never; Returns: string }
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      slot_is_available: {
        Args: { p_end: string; p_professional_id: string; p_start: string }
        Returns: boolean
      }
    }
    Enums: {
      appointment_status:
        | "proposed"
        | "confirmed"
        | "in_progress"
        | "completed"
        | "cancelled"
        | "no_show"
      availability_exception_kind: "block" | "extra"
      phase_kind: "clinical" | "lab_wait"
      treatment_status: "planned" | "in_progress" | "completed" | "cancelled"
      user_role: "admin" | "doctor" | "reception" | "patient"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      appointment_status: [
        "proposed",
        "confirmed",
        "in_progress",
        "completed",
        "cancelled",
        "no_show",
      ],
      availability_exception_kind: ["block", "extra"],
      phase_kind: ["clinical", "lab_wait"],
      treatment_status: ["planned", "in_progress", "completed", "cancelled"],
      user_role: ["admin", "doctor", "reception", "patient"],
    },
  },
} as const

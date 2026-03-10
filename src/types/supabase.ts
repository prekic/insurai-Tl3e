export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.1'
  }
  public: {
    Tables: {
      actuarial_config_set_versions: {
        Row: {
          change_summary: string | null
          config_data: Json
          config_set_id: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean | null
          version: number
        }
        Insert: {
          change_summary?: string | null
          config_data: Json
          config_set_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          version?: number
        }
        Update: {
          change_summary?: string | null
          config_data?: Json
          config_set_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: 'actuarial_config_set_versions_config_set_id_fkey'
            columns: ['config_set_id']
            isOneToOne: false
            referencedRelation: 'actuarial_config_sets'
            referencedColumns: ['id']
          },
        ]
      }
      actuarial_config_sets: {
        Row: {
          config_type: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          updated_at: string
        }
        Insert: {
          config_type?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          updated_at?: string
        }
        Update: {
          config_type?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      actuarial_evaluation_results: {
        Row: {
          blocking_reason_count: number | null
          config_snapshot: string | null
          contract_quality_score: number | null
          created_at: string
          eligible: boolean
          evaluated_at: string
          expected_oop_amount: number | null
          expected_oop_currency: string | null
          id: string
          needs_review: boolean | null
          policy_id: string
          result_data: Json
          run_id: string
          topsis_closeness: number | null
          topsis_grade: string | null
          topsis_rank: number | null
          warning_count: number | null
        }
        Insert: {
          blocking_reason_count?: number | null
          config_snapshot?: string | null
          contract_quality_score?: number | null
          created_at?: string
          eligible: boolean
          evaluated_at?: string
          expected_oop_amount?: number | null
          expected_oop_currency?: string | null
          id?: string
          needs_review?: boolean | null
          policy_id: string
          result_data: Json
          run_id: string
          topsis_closeness?: number | null
          topsis_grade?: string | null
          topsis_rank?: number | null
          warning_count?: number | null
        }
        Update: {
          blocking_reason_count?: number | null
          config_snapshot?: string | null
          contract_quality_score?: number | null
          created_at?: string
          eligible?: boolean
          evaluated_at?: string
          expected_oop_amount?: number | null
          expected_oop_currency?: string | null
          id?: string
          needs_review?: boolean | null
          policy_id?: string
          result_data?: Json
          run_id?: string
          topsis_closeness?: number | null
          topsis_grade?: string | null
          topsis_rank?: number | null
          warning_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: 'actuarial_evaluation_results_policy_id_fkey'
            columns: ['policy_id']
            isOneToOne: false
            referencedRelation: 'policies'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'actuarial_evaluation_results_run_id_fkey'
            columns: ['run_id']
            isOneToOne: false
            referencedRelation: 'actuarial_evaluation_runs'
            referencedColumns: ['id']
          },
        ]
      }
      actuarial_evaluation_runs: {
        Row: {
          completed_at: string | null
          compliance_config_version_id: string | null
          created_at: string
          duration_ms: number | null
          effective_date: string | null
          error_message: string | null
          extraction_id: string | null
          id: string
          monte_carlo_config_version_id: string | null
          monte_carlo_seed: number | null
          monte_carlo_simulations: number | null
          policy_id: string
          scenario_config_version_id: string | null
          skip_ranking: boolean | null
          skip_semantic_analysis: boolean | null
          started_at: string | null
          status: string
          topsis_config_version_id: string | null
        }
        Insert: {
          completed_at?: string | null
          compliance_config_version_id?: string | null
          created_at?: string
          duration_ms?: number | null
          effective_date?: string | null
          error_message?: string | null
          extraction_id?: string | null
          id?: string
          monte_carlo_config_version_id?: string | null
          monte_carlo_seed?: number | null
          monte_carlo_simulations?: number | null
          policy_id: string
          scenario_config_version_id?: string | null
          skip_ranking?: boolean | null
          skip_semantic_analysis?: boolean | null
          started_at?: string | null
          status?: string
          topsis_config_version_id?: string | null
        }
        Update: {
          completed_at?: string | null
          compliance_config_version_id?: string | null
          created_at?: string
          duration_ms?: number | null
          effective_date?: string | null
          error_message?: string | null
          extraction_id?: string | null
          id?: string
          monte_carlo_config_version_id?: string | null
          monte_carlo_seed?: number | null
          monte_carlo_simulations?: number | null
          policy_id?: string
          scenario_config_version_id?: string | null
          skip_ranking?: boolean | null
          skip_semantic_analysis?: boolean | null
          started_at?: string | null
          status?: string
          topsis_config_version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'actuarial_evaluation_runs_compliance_config_version_id_fkey'
            columns: ['compliance_config_version_id']
            isOneToOne: false
            referencedRelation: 'actuarial_config_set_versions'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'actuarial_evaluation_runs_extraction_id_fkey'
            columns: ['extraction_id']
            isOneToOne: false
            referencedRelation: 'policy_extractions'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'actuarial_evaluation_runs_monte_carlo_config_version_id_fkey'
            columns: ['monte_carlo_config_version_id']
            isOneToOne: false
            referencedRelation: 'actuarial_config_set_versions'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'actuarial_evaluation_runs_policy_id_fkey'
            columns: ['policy_id']
            isOneToOne: false
            referencedRelation: 'policies'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'actuarial_evaluation_runs_scenario_config_version_id_fkey'
            columns: ['scenario_config_version_id']
            isOneToOne: false
            referencedRelation: 'actuarial_config_set_versions'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'actuarial_evaluation_runs_topsis_config_version_id_fkey'
            columns: ['topsis_config_version_id']
            isOneToOne: false
            referencedRelation: 'actuarial_config_set_versions'
            referencedColumns: ['id']
          },
        ]
      }
      admin_notifications: {
        Row: {
          acknowledged: boolean | null
          acknowledged_at: string | null
          acknowledged_by: string | null
          category: string
          created_at: string | null
          details: Json | null
          id: string
          message: string
          provider: string | null
          title: string
          type: string
        }
        Insert: {
          acknowledged?: boolean | null
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          category: string
          created_at?: string | null
          details?: Json | null
          id?: string
          message: string
          provider?: string | null
          title: string
          type: string
        }
        Update: {
          acknowledged?: boolean | null
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          category?: string
          created_at?: string | null
          details?: Json | null
          id?: string
          message?: string
          provider?: string | null
          title?: string
          type?: string
        }
        Relationships: []
      }
      admin_sessions: {
        Row: {
          admin_id: string | null
          created_at: string | null
          expires_at: string
          id: string
          ip_address: string | null
          last_activity_at: string | null
          refresh_token_hash: string | null
          revoked_at: string | null
          revoked_by: string | null
          token_hash: string
          user_agent: string | null
        }
        Insert: {
          admin_id?: string | null
          created_at?: string | null
          expires_at: string
          id?: string
          ip_address?: string | null
          last_activity_at?: string | null
          refresh_token_hash?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          token_hash: string
          user_agent?: string | null
        }
        Update: {
          admin_id?: string | null
          created_at?: string | null
          expires_at?: string
          id?: string
          ip_address?: string | null
          last_activity_at?: string | null
          refresh_token_hash?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          token_hash?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'admin_sessions_admin_id_fkey'
            columns: ['admin_id']
            isOneToOne: false
            referencedRelation: 'admin_users'
            referencedColumns: ['id']
          },
        ]
      }
      admin_users: {
        Row: {
          created_at: string | null
          email: string
          id: string
          last_login_at: string | null
          last_login_ip: string | null
          login_count: number | null
          password_hash: string
          permissions: string[] | null
          role: string
          status: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          id?: string
          last_login_at?: string | null
          last_login_ip?: string | null
          login_count?: number | null
          password_hash: string
          permissions?: string[] | null
          role: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          last_login_at?: string | null
          last_login_ip?: string | null
          login_count?: number | null
          password_hash?: string
          permissions?: string[] | null
          role?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      ai_insight_guidelines: {
        Row: {
          created_at: string | null
          created_by: string | null
          guidance_text: string
          id: string
          is_active: boolean | null
          notes: string | null
          policy_type: string
          region_code: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          guidance_text: string
          id?: string
          is_active?: boolean | null
          notes?: string | null
          policy_type?: string
          region_code?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          guidance_text?: string
          id?: string
          is_active?: boolean | null
          notes?: string | null
          policy_type?: string
          region_code?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'ai_insight_guidelines_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'admin_users'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ai_insight_guidelines_updated_by_fkey'
            columns: ['updated_by']
            isOneToOne: false
            referencedRelation: 'admin_users'
            referencedColumns: ['id']
          },
        ]
      }
      app_configs: {
        Row: {
          category: string
          description: string | null
          id: string
          key: string
          updated_at: string | null
          updated_by: string | null
          value: Json
        }
        Insert: {
          category: string
          description?: string | null
          id?: string
          key: string
          updated_at?: string | null
          updated_by?: string | null
          value: Json
        }
        Update: {
          category?: string
          description?: string | null
          id?: string
          key?: string
          updated_at?: string | null
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          allowed_values: Json | null
          category: string
          created_at: string | null
          description: string | null
          description_tr: string | null
          display_order: number | null
          id: string
          is_readonly: boolean | null
          is_sensitive: boolean | null
          key: string
          max_value: number | null
          min_value: number | null
          schema: Json | null
          updated_at: string | null
          updated_by: string | null
          value: Json
          value_type: string | null
        }
        Insert: {
          allowed_values?: Json | null
          category: string
          created_at?: string | null
          description?: string | null
          description_tr?: string | null
          display_order?: number | null
          id?: string
          is_readonly?: boolean | null
          is_sensitive?: boolean | null
          key: string
          max_value?: number | null
          min_value?: number | null
          schema?: Json | null
          updated_at?: string | null
          updated_by?: string | null
          value: Json
          value_type?: string | null
        }
        Update: {
          allowed_values?: Json | null
          category?: string
          created_at?: string | null
          description?: string | null
          description_tr?: string | null
          display_order?: number | null
          id?: string
          is_readonly?: boolean | null
          is_sensitive?: boolean | null
          key?: string
          max_value?: number | null
          min_value?: number | null
          schema?: Json | null
          updated_at?: string | null
          updated_by?: string | null
          value?: Json
          value_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'app_settings_updated_by_fkey'
            columns: ['updated_by']
            isOneToOne: false
            referencedRelation: 'admin_users'
            referencedColumns: ['id']
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          actor_role: string | null
          details: Json | null
          id: string
          ip_address: string | null
          resource_id: string | null
          resource_type: string
          session_id: string | null
          timestamp: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          actor_role?: string | null
          details?: Json | null
          id?: string
          ip_address?: string | null
          resource_id?: string | null
          resource_type: string
          session_id?: string | null
          timestamp?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          actor_role?: string | null
          details?: Json | null
          id?: string
          ip_address?: string | null
          resource_id?: string | null
          resource_type?: string
          session_id?: string | null
          timestamp?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      config_drift_baselines: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          snapshot: Json
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          snapshot: Json
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          snapshot?: Json
        }
        Relationships: []
      }
      document_processing_logs: {
        Row: {
          ai_provider: string | null
          completed_at: string | null
          created_at: string | null
          document_id: string
          error_details: Json | null
          error_message: string | null
          error_stage: string | null
          extracted_summary: Json | null
          extraction_confidence: number | null
          file_size: number | null
          filename: string
          id: string
          mime_type: string | null
          ocr_engine: string | null
          ocr_used: boolean | null
          page_count: number | null
          policy_id: string | null
          stages: Json
          started_at: string | null
          status: string
          total_duration_ms: number | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          ai_provider?: string | null
          completed_at?: string | null
          created_at?: string | null
          document_id: string
          error_details?: Json | null
          error_message?: string | null
          error_stage?: string | null
          extracted_summary?: Json | null
          extraction_confidence?: number | null
          file_size?: number | null
          filename: string
          id?: string
          mime_type?: string | null
          ocr_engine?: string | null
          ocr_used?: boolean | null
          page_count?: number | null
          policy_id?: string | null
          stages?: Json
          started_at?: string | null
          status?: string
          total_duration_ms?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          ai_provider?: string | null
          completed_at?: string | null
          created_at?: string | null
          document_id?: string
          error_details?: Json | null
          error_message?: string | null
          error_stage?: string | null
          extracted_summary?: Json | null
          extraction_confidence?: number | null
          file_size?: number | null
          filename?: string
          id?: string
          mime_type?: string | null
          ocr_engine?: string | null
          ocr_used?: boolean | null
          page_count?: number | null
          policy_id?: string | null
          stages?: Json
          started_at?: string | null
          status?: string
          total_duration_ms?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'document_processing_logs_policy_id_fkey'
            columns: ['policy_id']
            isOneToOne: false
            referencedRelation: 'policies'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'document_processing_logs_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      extraction_evidence: {
        Row: {
          confidence: number | null
          created_at: string
          extraction_id: string
          field_path: string
          id: string
          needs_review: boolean | null
          page_number: number | null
          raw_text: string | null
          review_reason: string | null
          snippet_id: string | null
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          extraction_id: string
          field_path: string
          id?: string
          needs_review?: boolean | null
          page_number?: number | null
          raw_text?: string | null
          review_reason?: string | null
          snippet_id?: string | null
        }
        Update: {
          confidence?: number | null
          created_at?: string
          extraction_id?: string
          field_path?: string
          id?: string
          needs_review?: boolean | null
          page_number?: number | null
          raw_text?: string | null
          review_reason?: string | null
          snippet_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'extraction_evidence_extraction_id_fkey'
            columns: ['extraction_id']
            isOneToOne: false
            referencedRelation: 'policy_extractions'
            referencedColumns: ['id']
          },
        ]
      }
      feature_flags: {
        Row: {
          conditions: Json | null
          created_at: string | null
          description: string | null
          enabled: boolean | null
          expires_at: string | null
          id: string
          key: string
          name: string
          rollout_percentage: number | null
          updated_at: string | null
          updated_by: string | null
          user_segments: Json | null
        }
        Insert: {
          conditions?: Json | null
          created_at?: string | null
          description?: string | null
          enabled?: boolean | null
          expires_at?: string | null
          id?: string
          key: string
          name: string
          rollout_percentage?: number | null
          updated_at?: string | null
          updated_by?: string | null
          user_segments?: Json | null
        }
        Update: {
          conditions?: Json | null
          created_at?: string | null
          description?: string | null
          enabled?: boolean | null
          expires_at?: string | null
          id?: string
          key?: string
          name?: string
          rollout_percentage?: number | null
          updated_at?: string | null
          updated_by?: string | null
          user_segments?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: 'feature_flags_updated_by_fkey'
            columns: ['updated_by']
            isOneToOne: false
            referencedRelation: 'admin_users'
            referencedColumns: ['id']
          },
        ]
      }
      fx_rate_history: {
        Row: {
          base_currency: string
          created_at: string | null
          id: string
          rate: number
          source: string
          target_currency: string
        }
        Insert: {
          base_currency?: string
          created_at?: string | null
          id?: string
          rate: number
          source: string
          target_currency: string
        }
        Update: {
          base_currency?: string
          created_at?: string | null
          id?: string
          rate?: number
          source?: string
          target_currency?: string
        }
        Relationships: []
      }
      insurance_providers: {
        Row: {
          code: string
          created_at: string | null
          customer_rating: number | null
          established_year: number | null
          headquarters: string | null
          id: string
          is_active: boolean | null
          logo_url: string | null
          market_share: number | null
          name: string
          name_tr: string | null
          notes: string | null
          specialties: Json | null
          updated_at: string | null
          updated_by: string | null
          website: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          customer_rating?: number | null
          established_year?: number | null
          headquarters?: string | null
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          market_share?: number | null
          name: string
          name_tr?: string | null
          notes?: string | null
          specialties?: Json | null
          updated_at?: string | null
          updated_by?: string | null
          website?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          customer_rating?: number | null
          established_year?: number | null
          headquarters?: string | null
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          market_share?: number | null
          name?: string
          name_tr?: string | null
          notes?: string | null
          specialties?: Json | null
          updated_at?: string | null
          updated_by?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'insurance_providers_updated_by_fkey'
            columns: ['updated_by']
            isOneToOne: false
            referencedRelation: 'admin_users'
            referencedColumns: ['id']
          },
        ]
      }
      market_benchmarks: {
        Row: {
          coverage_name_tr: string | null
          coverage_type: string
          created_at: string | null
          created_by: string | null
          effective_date: string | null
          id: string
          importance: string | null
          inclusion_rate: number | null
          is_active: boolean | null
          max_deductible: number | null
          max_limit: number | null
          min_deductible: number | null
          min_limit: number | null
          notes: string | null
          policy_type: string
          region_code: string | null
          source: string | null
          typical_deductible: number | null
          typical_limit: number | null
          updated_at: string | null
          version: number | null
          year: number
        }
        Insert: {
          coverage_name_tr?: string | null
          coverage_type: string
          created_at?: string | null
          created_by?: string | null
          effective_date?: string | null
          id?: string
          importance?: string | null
          inclusion_rate?: number | null
          is_active?: boolean | null
          max_deductible?: number | null
          max_limit?: number | null
          min_deductible?: number | null
          min_limit?: number | null
          notes?: string | null
          policy_type: string
          region_code?: string | null
          source?: string | null
          typical_deductible?: number | null
          typical_limit?: number | null
          updated_at?: string | null
          version?: number | null
          year: number
        }
        Update: {
          coverage_name_tr?: string | null
          coverage_type?: string
          created_at?: string | null
          created_by?: string | null
          effective_date?: string | null
          id?: string
          importance?: string | null
          inclusion_rate?: number | null
          is_active?: boolean | null
          max_deductible?: number | null
          max_limit?: number | null
          min_deductible?: number | null
          min_limit?: number | null
          notes?: string | null
          policy_type?: string
          region_code?: string | null
          source?: string | null
          typical_deductible?: number | null
          typical_limit?: number | null
          updated_at?: string | null
          version?: number | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: 'market_benchmarks_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'admin_users'
            referencedColumns: ['id']
          },
        ]
      }
      policies: {
        Row: {
          coverage: number
          created_at: string | null
          deductible: number | null
          document_type: string | null
          expiry_date: string
          id: string
          insured_person: string
          location: string | null
          logo: string | null
          policy_number: string
          premium: number
          provider: string
          raw_data: Json | null
          start_date: string
          status: Database['public']['Enums']['policy_status'] | null
          type: Database['public']['Enums']['policy_type']
          type_tr: string
          updated_at: string | null
          upload_date: string | null
          user_id: string
        }
        Insert: {
          coverage: number
          created_at?: string | null
          deductible?: number | null
          document_type?: string | null
          expiry_date: string
          id?: string
          insured_person: string
          location?: string | null
          logo?: string | null
          policy_number: string
          premium: number
          provider: string
          raw_data?: Json | null
          start_date: string
          status?: Database['public']['Enums']['policy_status'] | null
          type: Database['public']['Enums']['policy_type']
          type_tr: string
          updated_at?: string | null
          upload_date?: string | null
          user_id: string
        }
        Update: {
          coverage?: number
          created_at?: string | null
          deductible?: number | null
          document_type?: string | null
          expiry_date?: string
          id?: string
          insured_person?: string
          location?: string | null
          logo?: string | null
          policy_number?: string
          premium?: number
          provider?: string
          raw_data?: Json | null
          start_date?: string
          status?: Database['public']['Enums']['policy_status'] | null
          type?: Database['public']['Enums']['policy_type']
          type_tr?: string
          updated_at?: string | null
          upload_date?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'policies_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      policy_documents: {
        Row: {
          file_name: string
          file_path: string
          file_size: number
          id: string
          mime_type: string
          policy_id: string
          uploaded_at: string | null
        }
        Insert: {
          file_name: string
          file_path: string
          file_size: number
          id?: string
          mime_type: string
          policy_id: string
          uploaded_at?: string | null
        }
        Update: {
          file_name?: string
          file_path?: string
          file_size?: number
          id?: string
          mime_type?: string
          policy_id?: string
          uploaded_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'policy_documents_policy_id_fkey'
            columns: ['policy_id']
            isOneToOne: false
            referencedRelation: 'policies'
            referencedColumns: ['id']
          },
        ]
      }
      policy_extractions: {
        Row: {
          completed_at: string | null
          created_at: string
          document_id: string | null
          evidence_coverage_percent: number | null
          extraction_model: string | null
          extraction_provider: string
          field_count: number | null
          fields_with_evidence: number | null
          id: string
          needs_review: boolean | null
          normalized_data: Json
          overall_confidence: number | null
          policy_id: string
          review_reasons: string[] | null
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          document_id?: string | null
          evidence_coverage_percent?: number | null
          extraction_model?: string | null
          extraction_provider: string
          field_count?: number | null
          fields_with_evidence?: number | null
          id?: string
          needs_review?: boolean | null
          normalized_data: Json
          overall_confidence?: number | null
          policy_id: string
          review_reasons?: string[] | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          document_id?: string | null
          evidence_coverage_percent?: number | null
          extraction_model?: string | null
          extraction_provider?: string
          field_count?: number | null
          fields_with_evidence?: number | null
          id?: string
          needs_review?: boolean | null
          normalized_data?: Json
          overall_confidence?: number | null
          policy_id?: string
          review_reasons?: string[] | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'policy_extractions_policy_id_fkey'
            columns: ['policy_id']
            isOneToOne: false
            referencedRelation: 'policies'
            referencedColumns: ['id']
          },
        ]
      }
      premium_benchmarks: {
        Row: {
          avg_premium: number
          comparison_method: Database['public']['Enums']['premium_comparison_method']
          created_at: string | null
          created_by: string | null
          currency: string
          id: string
          insurance_type: string
          insurance_type_tr: string
          is_active: boolean
          max_premium: number
          min_premium: number
          notes: string | null
          notes_tr: string | null
          source: string | null
          source_tr: string | null
          sub_type: string | null
          sub_type_tr: string | null
          updated_at: string | null
          updated_by: string | null
          value_avg_rate: number | null
          value_max_rate: number | null
          value_min_rate: number | null
          year: number
        }
        Insert: {
          avg_premium?: number
          comparison_method?: Database['public']['Enums']['premium_comparison_method']
          created_at?: string | null
          created_by?: string | null
          currency?: string
          id?: string
          insurance_type: string
          insurance_type_tr: string
          is_active?: boolean
          max_premium?: number
          min_premium?: number
          notes?: string | null
          notes_tr?: string | null
          source?: string | null
          source_tr?: string | null
          sub_type?: string | null
          sub_type_tr?: string | null
          updated_at?: string | null
          updated_by?: string | null
          value_avg_rate?: number | null
          value_max_rate?: number | null
          value_min_rate?: number | null
          year?: number
        }
        Update: {
          avg_premium?: number
          comparison_method?: Database['public']['Enums']['premium_comparison_method']
          created_at?: string | null
          created_by?: string | null
          currency?: string
          id?: string
          insurance_type?: string
          insurance_type_tr?: string
          is_active?: boolean
          max_premium?: number
          min_premium?: number
          notes?: string | null
          notes_tr?: string | null
          source?: string | null
          source_tr?: string | null
          sub_type?: string | null
          sub_type_tr?: string | null
          updated_at?: string | null
          updated_by?: string | null
          value_avg_rate?: number | null
          value_max_rate?: number | null
          value_min_rate?: number | null
          year?: number
        }
        Relationships: []
      }
      prompt_templates: {
        Row: {
          category: string
          created_at: string | null
          created_by: string | null
          default_model: string | null
          default_provider: string | null
          description: string | null
          id: string
          is_active: boolean | null
          last_used_at: string | null
          name: string
          parameters: Json | null
          system_prompt: string
          updated_at: string | null
          updated_by: string | null
          usage_count: number | null
          user_prompt_template: string
          variables: Json | null
          version: number | null
        }
        Insert: {
          category: string
          created_at?: string | null
          created_by?: string | null
          default_model?: string | null
          default_provider?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          last_used_at?: string | null
          name: string
          parameters?: Json | null
          system_prompt: string
          updated_at?: string | null
          updated_by?: string | null
          usage_count?: number | null
          user_prompt_template: string
          variables?: Json | null
          version?: number | null
        }
        Update: {
          category?: string
          created_at?: string | null
          created_by?: string | null
          default_model?: string | null
          default_provider?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          last_used_at?: string | null
          name?: string
          parameters?: Json | null
          system_prompt?: string
          updated_at?: string | null
          updated_by?: string | null
          usage_count?: number | null
          user_prompt_template?: string
          variables?: Json | null
          version?: number | null
        }
        Relationships: []
      }
      prompt_versions: {
        Row: {
          change_notes: string | null
          created_at: string | null
          created_by: string | null
          id: string
          parameters: Json | null
          system_prompt: string
          template_id: string | null
          user_prompt_template: string
          variables: Json | null
          version: number
        }
        Insert: {
          change_notes?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          parameters?: Json | null
          system_prompt: string
          template_id?: string | null
          user_prompt_template: string
          variables?: Json | null
          version: number
        }
        Update: {
          change_notes?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          parameters?: Json | null
          system_prompt?: string
          template_id?: string | null
          user_prompt_template?: string
          variables?: Json | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: 'prompt_versions_template_id_fkey'
            columns: ['template_id']
            isOneToOne: false
            referencedRelation: 'prompt_templates'
            referencedColumns: ['id']
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string | null
          endpoint: string
          id: string
          p256dh: string
          updated_at: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string | null
          endpoint: string
          id?: string
          p256dh: string
          updated_at?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string | null
          endpoint?: string
          id?: string
          p256dh?: string
          updated_at?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'push_subscriptions_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      regional_factors: {
        Row: {
          id: string
          is_active: boolean | null
          notes: string | null
          policy_type: string
          region_code: string
          region_name: string
          region_name_tr: string | null
          risk_factor: number
          source: string | null
          updated_at: string | null
          updated_by: string | null
          year: number
        }
        Insert: {
          id?: string
          is_active?: boolean | null
          notes?: string | null
          policy_type?: string
          region_code: string
          region_name: string
          region_name_tr?: string | null
          risk_factor: number
          source?: string | null
          updated_at?: string | null
          updated_by?: string | null
          year: number
        }
        Update: {
          id?: string
          is_active?: boolean | null
          notes?: string | null
          policy_type?: string
          region_code?: string
          region_name?: string
          region_name_tr?: string | null
          risk_factor?: number
          source?: string | null
          updated_at?: string | null
          updated_by?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: 'regional_factors_updated_by_fkey'
            columns: ['updated_by']
            isOneToOne: false
            referencedRelation: 'admin_users'
            referencedColumns: ['id']
          },
        ]
      }
      security_events: {
        Row: {
          details: Json | null
          event_type: string
          id: string
          ip_address: string | null
          resolution_notes: string | null
          resolved: boolean | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          timestamp: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          details?: Json | null
          event_type: string
          id?: string
          ip_address?: string | null
          resolution_notes?: string | null
          resolved?: boolean | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity: string
          timestamp?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          details?: Json | null
          event_type?: string
          id?: string
          ip_address?: string | null
          resolution_notes?: string | null
          resolved?: boolean | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          timestamp?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      settings_audit_log: {
        Row: {
          category: string
          changed_at: string | null
          changed_by: string | null
          id: string
          ip_address: unknown
          key: string
          new_value: Json | null
          previous_value: Json | null
          reason: string | null
          setting_id: string | null
          user_agent: string | null
        }
        Insert: {
          category: string
          changed_at?: string | null
          changed_by?: string | null
          id?: string
          ip_address?: unknown
          key: string
          new_value?: Json | null
          previous_value?: Json | null
          reason?: string | null
          setting_id?: string | null
          user_agent?: string | null
        }
        Update: {
          category?: string
          changed_at?: string | null
          changed_by?: string | null
          id?: string
          ip_address?: unknown
          key?: string
          new_value?: Json | null
          previous_value?: Json | null
          reason?: string | null
          setting_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'settings_audit_log_changed_by_fkey'
            columns: ['changed_by']
            isOneToOne: false
            referencedRelation: 'admin_users'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'settings_audit_log_setting_id_fkey'
            columns: ['setting_id']
            isOneToOne: false
            referencedRelation: 'app_settings'
            referencedColumns: ['id']
          },
        ]
      }
      settings_webhooks: {
        Row: {
          categories: Json
          created_at: string
          enabled: boolean
          events: Json
          failure_count: number
          id: string
          last_triggered_at: string | null
          name: string
          secret: string
          updated_at: string
          url: string
        }
        Insert: {
          categories?: Json
          created_at?: string
          enabled?: boolean
          events?: Json
          failure_count?: number
          id?: string
          last_triggered_at?: string | null
          name: string
          secret: string
          updated_at?: string
          url: string
        }
        Update: {
          categories?: Json
          created_at?: string
          enabled?: boolean
          events?: Json
          failure_count?: number
          id?: string
          last_triggered_at?: string | null
          name?: string
          secret?: string
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
      translation_audit_log: {
        Row: {
          changed_at: string | null
          changed_by: string | null
          id: string
          key: string
          locale: string
          new_value: string
          previous_value: string | null
          section: string
          translation_id: string | null
        }
        Insert: {
          changed_at?: string | null
          changed_by?: string | null
          id?: string
          key: string
          locale: string
          new_value: string
          previous_value?: string | null
          section: string
          translation_id?: string | null
        }
        Update: {
          changed_at?: string | null
          changed_by?: string | null
          id?: string
          key?: string
          locale?: string
          new_value?: string
          previous_value?: string | null
          section?: string
          translation_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'translation_audit_log_changed_by_fkey'
            columns: ['changed_by']
            isOneToOne: false
            referencedRelation: 'admin_users'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'translation_audit_log_translation_id_fkey'
            columns: ['translation_id']
            isOneToOne: false
            referencedRelation: 'translations'
            referencedColumns: ['id']
          },
        ]
      }
      translation_keys: {
        Row: {
          context: string | null
          created_at: string | null
          description: string | null
          id: string
          key: string
          max_length: number | null
          section: string
        }
        Insert: {
          context?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          key: string
          max_length?: number | null
          section: string
        }
        Update: {
          context?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          key?: string
          max_length?: number | null
          section?: string
        }
        Relationships: []
      }
      translation_locales: {
        Row: {
          code: string
          created_at: string | null
          display_order: number | null
          flag: string | null
          is_active: boolean | null
          is_default: boolean | null
          is_rtl: boolean | null
          name: string
          native_name: string
          updated_at: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          display_order?: number | null
          flag?: string | null
          is_active?: boolean | null
          is_default?: boolean | null
          is_rtl?: boolean | null
          name: string
          native_name: string
          updated_at?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          display_order?: number | null
          flag?: string | null
          is_active?: boolean | null
          is_default?: boolean | null
          is_rtl?: boolean | null
          name?: string
          native_name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      translation_metadata: {
        Row: {
          key: string
          updated_at: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string | null
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string | null
          value?: Json
        }
        Relationships: []
      }
      translations: {
        Row: {
          created_at: string | null
          id: string
          is_reviewed: boolean | null
          key_id: string
          locale: string
          updated_at: string | null
          updated_by: string | null
          value: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_reviewed?: boolean | null
          key_id: string
          locale: string
          updated_at?: string | null
          updated_by?: string | null
          value: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_reviewed?: boolean | null
          key_id?: string
          locale?: string
          updated_at?: string | null
          updated_by?: string | null
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: 'translations_key_id_fkey'
            columns: ['key_id']
            isOneToOne: false
            referencedRelation: 'translation_keys'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'translations_locale_fkey'
            columns: ['locale']
            isOneToOne: false
            referencedRelation: 'translation_locales'
            referencedColumns: ['code']
          },
          {
            foreignKeyName: 'translations_updated_by_fkey'
            columns: ['updated_by']
            isOneToOne: false
            referencedRelation: 'admin_users'
            referencedColumns: ['id']
          },
        ]
      }
      user_preferences: {
        Row: {
          category: string
          id: string
          preferences: Json
          updated_at: string | null
          user_id: string
        }
        Insert: {
          category: string
          id?: string
          preferences?: Json
          updated_at?: string | null
          user_id: string
        }
        Update: {
          category?: string
          id?: string
          preferences?: Json
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'user_preferences_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      users: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          email: string
          full_name: string | null
          id: string
          locale: string | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          email: string
          full_name?: string | null
          id: string
          locale?: string | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string
          full_name?: string | null
          id?: string
          locale?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      webhook_deliveries: {
        Row: {
          attempts: number
          completed_at: string | null
          created_at: string
          error_message: string | null
          event: string
          id: string
          max_attempts: number
          next_retry_at: string | null
          payload: Json
          response_body: string | null
          status: string
          status_code: number | null
          webhook_id: string
        }
        Insert: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          event: string
          id?: string
          max_attempts?: number
          next_retry_at?: string | null
          payload: Json
          response_body?: string | null
          status?: string
          status_code?: number | null
          webhook_id: string
        }
        Update: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          event?: string
          id?: string
          max_attempts?: number
          next_retry_at?: string | null
          payload?: Json
          response_body?: string | null
          status?: string
          status_code?: number | null
          webhook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'webhook_deliveries_webhook_id_fkey'
            columns: ['webhook_id']
            isOneToOne: false
            referencedRelation: 'settings_webhooks'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: {
      vw_cron_job_runs: {
        Row: {
          command: string | null
          database: string | null
          end_time: string | null
          job_pid: number | null
          jobid: number | null
          return_message: string | null
          runid: number | null
          start_time: string | null
          status: string | null
          username: string | null
        }
        Insert: {
          command?: string | null
          database?: string | null
          end_time?: string | null
          job_pid?: number | null
          jobid?: number | null
          return_message?: string | null
          runid?: number | null
          start_time?: string | null
          status?: string | null
          username?: string | null
        }
        Update: {
          command?: string | null
          database?: string | null
          end_time?: string | null
          job_pid?: number | null
          jobid?: number | null
          return_message?: string | null
          runid?: number | null
          start_time?: string | null
          status?: string | null
          username?: string | null
        }
        Relationships: []
      }
      vw_cron_jobs: {
        Row: {
          active: boolean | null
          command: string | null
          database: string | null
          jobid: number | null
          jobname: string | null
          nodename: string | null
          nodeport: number | null
          schedule: string | null
          username: string | null
        }
        Insert: {
          active?: boolean | null
          command?: string | null
          database?: string | null
          jobid?: number | null
          jobname?: string | null
          nodename?: string | null
          nodeport?: number | null
          schedule?: string | null
          username?: string | null
        }
        Update: {
          active?: boolean | null
          command?: string | null
          database?: string | null
          jobid?: number | null
          jobname?: string | null
          nodename?: string | null
          nodeport?: number | null
          schedule?: string | null
          username?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      add_processing_stage: {
        Args: {
          p_document_id: string
          p_duration_ms?: number
          p_error?: string
          p_input?: Json
          p_metadata?: Json
          p_output?: Json
          p_stage: string
          p_status: string
        }
        Returns: undefined
      }
      cleanup_extraction_metrics_configurable: {
        Args: never
        Returns: undefined
      }
      cleanup_processing_logs_configurable: { Args: never; Returns: undefined }
      get_policy_history: {
        Args: { p_policy_id: string }
        Returns: {
          change_summary: string
          change_type: string
          changed_at: string
          new_data: Json
          version_number: number
        }[]
      }
      search_policies: {
        Args: { search_query: string }
        Returns: {
          coverage: number
          created_at: string | null
          deductible: number | null
          document_type: string | null
          expiry_date: string
          id: string
          insured_person: string
          location: string | null
          logo: string | null
          policy_number: string
          premium: number
          provider: string
          raw_data: Json | null
          start_date: string
          status: Database['public']['Enums']['policy_status'] | null
          type: Database['public']['Enums']['policy_type']
          type_tr: string
          updated_at: string | null
          upload_date: string | null
          user_id: string
        }[]
        SetofOptions: {
          from: '*'
          to: 'policies'
          isOneToOne: false
          isSetofReturn: true
        }
      }
    }
    Enums: {
      policy_status: 'active' | 'expiring' | 'expired'
      policy_type:
        | 'auto'
        | 'home'
        | 'health'
        | 'life'
        | 'business'
        | 'travel'
        | 'kasko'
        | 'traffic'
        | 'dask'
      premium_comparison_method: 'direct_premium' | 'value_based'
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      policy_status: ['active', 'expiring', 'expired'],
      policy_type: [
        'auto',
        'home',
        'health',
        'life',
        'business',
        'travel',
        'kasko',
        'traffic',
        'dask',
      ],
      premium_comparison_method: ['direct_premium', 'value_based'],
    },
  },
} as const

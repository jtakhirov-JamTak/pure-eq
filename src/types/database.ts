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
      ai_card_edits: {
        Row: {
          card_edit_id: string
          card_key: string
          created_at: string
          edited_text: string | null
          entry_id: string
          entry_table: string
          original_text: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          card_edit_id?: string
          card_key: string
          created_at?: string
          edited_text?: string | null
          entry_id: string
          entry_table: string
          original_text?: string | null
          status: string
          updated_at?: string
          user_id: string
        }
        Update: {
          card_edit_id?: string
          card_key?: string
          created_at?: string
          edited_text?: string | null
          entry_id?: string
          entry_table?: string
          original_text?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      before_you_send_entries: {
        Row: {
          ai_tier: string | null
          ai_verdict_json: Json | null
          ai_verdict_version: number | null
          before_you_send_entry_id: string
          completed_at: string | null
          created_at: string
          deleted_at: string | null
          desired_outcome: string | null
          draft_text: string | null
          intent_optional: string | null
          is_complete: boolean
          message_type: string | null
          outcome_json: Json | null
          person_id: string | null
          raw_record_id: string | null
          risk_context: string | null
          situation_facts: string | null
          thread_id: string | null
          user_id: string
        }
        Insert: {
          ai_tier?: string | null
          ai_verdict_json?: Json | null
          ai_verdict_version?: number | null
          before_you_send_entry_id?: string
          completed_at?: string | null
          created_at?: string
          deleted_at?: string | null
          desired_outcome?: string | null
          draft_text?: string | null
          intent_optional?: string | null
          is_complete?: boolean
          message_type?: string | null
          outcome_json?: Json | null
          person_id?: string | null
          raw_record_id?: string | null
          risk_context?: string | null
          situation_facts?: string | null
          thread_id?: string | null
          user_id: string
        }
        Update: {
          ai_tier?: string | null
          ai_verdict_json?: Json | null
          ai_verdict_version?: number | null
          before_you_send_entry_id?: string
          completed_at?: string | null
          created_at?: string
          deleted_at?: string | null
          desired_outcome?: string | null
          draft_text?: string | null
          intent_optional?: string | null
          is_complete?: boolean
          message_type?: string | null
          outcome_json?: Json | null
          person_id?: string | null
          raw_record_id?: string | null
          risk_context?: string | null
          situation_facts?: string | null
          thread_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "before_you_send_entries_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "before_you_send_entries_raw_record_id_fkey"
            columns: ["raw_record_id"]
            isOneToOne: false
            referencedRelation: "raw_records"
            referencedColumns: ["raw_record_id"]
          },
          {
            foreignKeyName: "before_you_send_entries_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "conversation_threads"
            referencedColumns: ["thread_id"]
          },
        ]
      }
      coin_balances: {
        Row: {
          balance: number
          created_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          created_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          created_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      coin_transactions: {
        Row: {
          balance_after: number
          created_at: string
          delta: number
          reason: string
          ref_key: string | null
          transaction_id: string
          user_id: string
        }
        Insert: {
          balance_after: number
          created_at?: string
          delta: number
          reason: string
          ref_key?: string | null
          transaction_id?: string
          user_id: string
        }
        Update: {
          balance_after?: number
          created_at?: string
          delta?: number
          reason?: string
          ref_key?: string | null
          transaction_id?: string
          user_id?: string
        }
        Relationships: []
      }
      conversation_threads: {
        Row: {
          last_activity_at: string
          person_id: string | null
          resolved_at: string | null
          started_at: string
          status: string
          thread_id: string
          thread_type: string | null
          title: string | null
          user_id: string
        }
        Insert: {
          last_activity_at?: string
          person_id?: string | null
          resolved_at?: string | null
          started_at?: string
          status?: string
          thread_id?: string
          thread_type?: string | null
          title?: string | null
          user_id: string
        }
        Update: {
          last_activity_at?: string
          person_id?: string | null
          resolved_at?: string | null
          started_at?: string
          status?: string
          thread_id?: string
          thread_type?: string | null
          title?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_threads_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["person_id"]
          },
        ]
      }
      derived_insights_v1_archive: {
        Row: {
          confidence_level: string
          derived_insight_id: string
          distinct_days: number
          event_types_used: Json
          evidence_count: number
          expires_at: string | null
          generated_at: string
          generator_version: string
          insight_type: string
          metadata_json: Json | null
          period_end: string
          period_start: string
          person_id: string | null
          summary_text: string
          supporting_pattern_ids: Json
          time_window_type: string
          user_id: string
        }
        Insert: {
          confidence_level: string
          derived_insight_id?: string
          distinct_days?: number
          event_types_used?: Json
          evidence_count?: number
          expires_at?: string | null
          generated_at?: string
          generator_version: string
          insight_type: string
          metadata_json?: Json | null
          period_end: string
          period_start: string
          person_id?: string | null
          summary_text: string
          supporting_pattern_ids?: Json
          time_window_type: string
          user_id: string
        }
        Update: {
          confidence_level?: string
          derived_insight_id?: string
          distinct_days?: number
          event_types_used?: Json
          evidence_count?: number
          expires_at?: string | null
          generated_at?: string
          generator_version?: string
          insight_type?: string
          metadata_json?: Json | null
          period_end?: string
          period_start?: string
          person_id?: string | null
          summary_text?: string
          supporting_pattern_ids?: Json
          time_window_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "derived_insights_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["person_id"]
          },
        ]
      }
      monthly_reports: {
        Row: {
          ai_duration_ms: number
          ai_json: Json
          generated_at: string
          generator_version: string
          input_entry_count: number
          input_window_days: number
          period_end: string
          period_start: string
          prompt_version: string
          report_id: string
          report_index: number
          server_json: Json
          user_id: string
        }
        Insert: {
          ai_duration_ms: number
          ai_json: Json
          generated_at?: string
          generator_version: string
          input_entry_count: number
          input_window_days?: number
          period_end: string
          period_start: string
          prompt_version: string
          report_id?: string
          report_index: number
          server_json: Json
          user_id: string
        }
        Update: {
          ai_duration_ms?: number
          ai_json?: Json
          generated_at?: string
          generator_version?: string
          input_entry_count?: number
          input_window_days?: number
          period_end?: string
          period_start?: string
          prompt_version?: string
          report_id?: string
          report_index?: number
          server_json?: Json
          user_id?: string
        }
        Relationships: []
      }
      overwhelmed_entries: {
        Row: {
          after_feeling: string | null
          ai_response_json: Json | null
          body_sensations: string | null
          completed_at: string | null
          created_at: string
          deleted_at: string | null
          is_complete: boolean
          overwhelm_after: number | null
          overwhelm_before: number | null
          overwhelmed_entry_id: string
          raw_record_id: string | null
          technique_used: string | null
          user_id: string
          what_happened: string | null
        }
        Insert: {
          after_feeling?: string | null
          ai_response_json?: Json | null
          body_sensations?: string | null
          completed_at?: string | null
          created_at?: string
          deleted_at?: string | null
          is_complete?: boolean
          overwhelm_after?: number | null
          overwhelm_before?: number | null
          overwhelmed_entry_id?: string
          raw_record_id?: string | null
          technique_used?: string | null
          user_id: string
          what_happened?: string | null
        }
        Update: {
          after_feeling?: string | null
          ai_response_json?: Json | null
          body_sensations?: string | null
          completed_at?: string | null
          created_at?: string
          deleted_at?: string | null
          is_complete?: boolean
          overwhelm_after?: number | null
          overwhelm_before?: number | null
          overwhelmed_entry_id?: string
          raw_record_id?: string | null
          technique_used?: string | null
          user_id?: string
          what_happened?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "overwhelmed_entries_raw_record_id_fkey"
            columns: ["raw_record_id"]
            isOneToOne: false
            referencedRelation: "raw_records"
            referencedColumns: ["raw_record_id"]
          },
        ]
      }
      pattern_observations_v1_archive: {
        Row: {
          confidence_score: number
          direction: string | null
          extractor_version: string
          observation_source: string
          observation_tag: string
          observation_type: string
          observed_at: string
          pattern_observation_id: string
          person_id: string | null
          source_interaction_entry_id: string | null
          source_raw_record_id: string
          supporting_evidence_json: Json | null
          thread_id: string | null
          user_id: string
        }
        Insert: {
          confidence_score: number
          direction?: string | null
          extractor_version: string
          observation_source?: string
          observation_tag: string
          observation_type: string
          observed_at?: string
          pattern_observation_id?: string
          person_id?: string | null
          source_interaction_entry_id?: string | null
          source_raw_record_id: string
          supporting_evidence_json?: Json | null
          thread_id?: string | null
          user_id: string
        }
        Update: {
          confidence_score?: number
          direction?: string | null
          extractor_version?: string
          observation_source?: string
          observation_tag?: string
          observation_type?: string
          observed_at?: string
          pattern_observation_id?: string
          person_id?: string | null
          source_interaction_entry_id?: string | null
          source_raw_record_id?: string
          supporting_evidence_json?: Json | null
          thread_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pattern_observations_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "pattern_observations_source_raw_record_id_fkey"
            columns: ["source_raw_record_id"]
            isOneToOne: false
            referencedRelation: "raw_records"
            referencedColumns: ["raw_record_id"]
          },
          {
            foreignKeyName: "pattern_observations_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "conversation_threads"
            referencedColumns: ["thread_id"]
          },
        ]
      }
      payment_webhook_events: {
        Row: {
          event_id: string
          received_at: string
          type: string
        }
        Insert: {
          event_id: string
          received_at?: string
          type: string
        }
        Update: {
          event_id?: string
          received_at?: string
          type?: string
        }
        Relationships: []
      }
      persons: {
        Row: {
          created_at: string
          display_name: string
          is_active: boolean
          person_id: string
          relationship_domain: string
          relationship_subtype: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name: string
          is_active?: boolean
          person_id?: string
          relationship_domain: string
          relationship_subtype?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string
          is_active?: boolean
          person_id?: string
          relationship_domain?: string
          relationship_subtype?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      prepare_entries: {
        Row: {
          afraid_it_means: string | null
          ai_headline: string | null
          ai_plan_json: Json | null
          ai_plan_version: number | null
          ai_tier: string | null
          ambiguity_flag: boolean
          body_location: string | null
          completed_at: string | null
          conversation_move: string | null
          created_at: string
          default_pattern: string | null
          deleted_at: string | null
          desired_outcome: string | null
          emotion_as_data: string | null
          fairest_version: string | null
          hidden_ask_and_floor: string | null
          hidden_expectation: string | null
          how_to_make_them_feel: string | null
          is_complete: boolean
          needs_user_confirmation: boolean
          neutral_check_question: string | null
          observed_from_them: string | null
          opener: string | null
          outcome_floor: string | null
          parse_confidence: number | null
          parsed_candidates: Json | null
          parser_version: number
          path: string | null
          pattern_tag: string | null
          person_id: string | null
          predicted_reaction: string | null
          prepare_entry_id: string
          primary_emotion: string | null
          primary_value: string | null
          raw_record_id: string | null
          signal_noise_observation: string | null
          situation_text: string | null
          specific_shift: string | null
          story_telling_yourself: string | null
          their_need: string | null
          their_state_hedged: string | null
          thread_id: string | null
          trigger_plan: string | null
          user_id: string
          what_changed: string | null
          what_feels_off: string | null
        }
        Insert: {
          afraid_it_means?: string | null
          ai_headline?: string | null
          ai_plan_json?: Json | null
          ai_plan_version?: number | null
          ai_tier?: string | null
          ambiguity_flag?: boolean
          body_location?: string | null
          completed_at?: string | null
          conversation_move?: string | null
          created_at?: string
          default_pattern?: string | null
          deleted_at?: string | null
          desired_outcome?: string | null
          emotion_as_data?: string | null
          fairest_version?: string | null
          hidden_ask_and_floor?: string | null
          hidden_expectation?: string | null
          how_to_make_them_feel?: string | null
          is_complete?: boolean
          needs_user_confirmation?: boolean
          neutral_check_question?: string | null
          observed_from_them?: string | null
          opener?: string | null
          outcome_floor?: string | null
          parse_confidence?: number | null
          parsed_candidates?: Json | null
          parser_version?: number
          path?: string | null
          pattern_tag?: string | null
          person_id?: string | null
          predicted_reaction?: string | null
          prepare_entry_id?: string
          primary_emotion?: string | null
          primary_value?: string | null
          raw_record_id?: string | null
          signal_noise_observation?: string | null
          situation_text?: string | null
          specific_shift?: string | null
          story_telling_yourself?: string | null
          their_need?: string | null
          their_state_hedged?: string | null
          thread_id?: string | null
          trigger_plan?: string | null
          user_id: string
          what_changed?: string | null
          what_feels_off?: string | null
        }
        Update: {
          afraid_it_means?: string | null
          ai_headline?: string | null
          ai_plan_json?: Json | null
          ai_plan_version?: number | null
          ai_tier?: string | null
          ambiguity_flag?: boolean
          body_location?: string | null
          completed_at?: string | null
          conversation_move?: string | null
          created_at?: string
          default_pattern?: string | null
          deleted_at?: string | null
          desired_outcome?: string | null
          emotion_as_data?: string | null
          fairest_version?: string | null
          hidden_ask_and_floor?: string | null
          hidden_expectation?: string | null
          how_to_make_them_feel?: string | null
          is_complete?: boolean
          needs_user_confirmation?: boolean
          neutral_check_question?: string | null
          observed_from_them?: string | null
          opener?: string | null
          outcome_floor?: string | null
          parse_confidence?: number | null
          parsed_candidates?: Json | null
          parser_version?: number
          path?: string | null
          pattern_tag?: string | null
          person_id?: string | null
          predicted_reaction?: string | null
          prepare_entry_id?: string
          primary_emotion?: string | null
          primary_value?: string | null
          raw_record_id?: string | null
          signal_noise_observation?: string | null
          situation_text?: string | null
          specific_shift?: string | null
          story_telling_yourself?: string | null
          their_need?: string | null
          their_state_hedged?: string | null
          thread_id?: string | null
          trigger_plan?: string | null
          user_id?: string
          what_changed?: string | null
          what_feels_off?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prepare_entries_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "prepare_entries_raw_record_id_fkey"
            columns: ["raw_record_id"]
            isOneToOne: false
            referencedRelation: "raw_records"
            referencedColumns: ["raw_record_id"]
          },
          {
            foreignKeyName: "prepare_entries_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "conversation_threads"
            referencedColumns: ["thread_id"]
          },
        ]
      }
      pulse_check_entries: {
        Row: {
          ai_headline: string | null
          ai_output_json: Json | null
          ai_output_version: number | null
          ai_tier: string | null
          alternative: string | null
          body_location: string | null
          check_window: string | null
          completed_at: string | null
          created_at: string
          deleted_at: string | null
          feeling_text: string | null
          is_complete: boolean
          light_check_question: string | null
          next_move: string | null
          next_move_chip: string | null
          outcome_json: Json | null
          person_id: string | null
          pulse_check_entry_id: string
          raw_record_id: string
          signal_noise_observation: string | null
          signal_test_confirm: string | null
          signal_test_disconfirm: string | null
          story: string | null
          theirs_not_about_you: string | null
          thread_id: string | null
          user_id: string
          what_changed_and_before: string | null
          what_feels_off: string | null
          when_it_shifted: string | null
        }
        Insert: {
          ai_headline?: string | null
          ai_output_json?: Json | null
          ai_output_version?: number | null
          ai_tier?: string | null
          alternative?: string | null
          body_location?: string | null
          check_window?: string | null
          completed_at?: string | null
          created_at?: string
          deleted_at?: string | null
          feeling_text?: string | null
          is_complete?: boolean
          light_check_question?: string | null
          next_move?: string | null
          next_move_chip?: string | null
          outcome_json?: Json | null
          person_id?: string | null
          pulse_check_entry_id?: string
          raw_record_id: string
          signal_noise_observation?: string | null
          signal_test_confirm?: string | null
          signal_test_disconfirm?: string | null
          story?: string | null
          theirs_not_about_you?: string | null
          thread_id?: string | null
          user_id: string
          what_changed_and_before?: string | null
          what_feels_off?: string | null
          when_it_shifted?: string | null
        }
        Update: {
          ai_headline?: string | null
          ai_output_json?: Json | null
          ai_output_version?: number | null
          ai_tier?: string | null
          alternative?: string | null
          body_location?: string | null
          check_window?: string | null
          completed_at?: string | null
          created_at?: string
          deleted_at?: string | null
          feeling_text?: string | null
          is_complete?: boolean
          light_check_question?: string | null
          next_move?: string | null
          next_move_chip?: string | null
          outcome_json?: Json | null
          person_id?: string | null
          pulse_check_entry_id?: string
          raw_record_id?: string
          signal_noise_observation?: string | null
          signal_test_confirm?: string | null
          signal_test_disconfirm?: string | null
          story?: string | null
          theirs_not_about_you?: string | null
          thread_id?: string | null
          user_id?: string
          what_changed_and_before?: string | null
          what_feels_off?: string | null
          when_it_shifted?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pulse_check_entries_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "pulse_check_entries_raw_record_id_fkey"
            columns: ["raw_record_id"]
            isOneToOne: false
            referencedRelation: "raw_records"
            referencedColumns: ["raw_record_id"]
          },
          {
            foreignKeyName: "pulse_check_entries_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "conversation_threads"
            referencedColumns: ["thread_id"]
          },
        ]
      }
      raw_records: {
        Row: {
          completed_at: string | null
          created_at: string
          deleted_at: string | null
          is_complete: boolean
          module_type: string
          payload_json: Json
          person_id: string | null
          raw_record_id: string
          record_type: string
          schema_version: number
          source_session_id: string
          thread_id: string | null
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          deleted_at?: string | null
          is_complete?: boolean
          module_type: string
          payload_json: Json
          person_id?: string | null
          raw_record_id?: string
          record_type: string
          schema_version?: number
          source_session_id: string
          thread_id?: string | null
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          deleted_at?: string | null
          is_complete?: boolean
          module_type?: string
          payload_json?: Json
          person_id?: string | null
          raw_record_id?: string
          record_type?: string
          schema_version?: number
          source_session_id?: string
          thread_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "raw_records_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "raw_records_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "conversation_threads"
            referencedColumns: ["thread_id"]
          },
        ]
      }
      relationship_memories: {
        Row: {
          last_interaction_at: string | null
          person_id: string
          pinned_notes: string | null
          relationship_memory_id: string
          updated_at: string
          user_id: string
          user_written_context: string | null
        }
        Insert: {
          last_interaction_at?: string | null
          person_id: string
          pinned_notes?: string | null
          relationship_memory_id?: string
          updated_at?: string
          user_id: string
          user_written_context?: string | null
        }
        Update: {
          last_interaction_at?: string | null
          person_id?: string
          pinned_notes?: string | null
          relationship_memory_id?: string
          updated_at?: string
          user_id?: string
          user_written_context?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "relationship_memories_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["person_id"]
          },
        ]
      }
      repair_entries: {
        Row: {
          ai_strategy_json: Json | null
          ai_strategy_version: number | null
          ai_tier: string | null
          channel: string
          completed_at: string | null
          created_at: string
          deleted_at: string | null
          desired_outcome: string
          is_complete: boolean
          outcome_json: Json | null
          person_id: string | null
          raw_record_id: string | null
          repair_entry_id: string
          their_need: string
          thread_id: string | null
          timing: string
          user_id: string
          what_needs_repair: string
          your_responsibility: string
        }
        Insert: {
          ai_strategy_json?: Json | null
          ai_strategy_version?: number | null
          ai_tier?: string | null
          channel: string
          completed_at?: string | null
          created_at?: string
          deleted_at?: string | null
          desired_outcome: string
          is_complete?: boolean
          outcome_json?: Json | null
          person_id?: string | null
          raw_record_id?: string | null
          repair_entry_id?: string
          their_need: string
          thread_id?: string | null
          timing: string
          user_id: string
          what_needs_repair: string
          your_responsibility: string
        }
        Update: {
          ai_strategy_json?: Json | null
          ai_strategy_version?: number | null
          ai_tier?: string | null
          channel?: string
          completed_at?: string | null
          created_at?: string
          deleted_at?: string | null
          desired_outcome?: string
          is_complete?: boolean
          outcome_json?: Json | null
          person_id?: string | null
          raw_record_id?: string | null
          repair_entry_id?: string
          their_need?: string
          thread_id?: string | null
          timing?: string
          user_id?: string
          what_needs_repair?: string
          your_responsibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "repair_entries_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "repair_entries_raw_record_id_fkey"
            columns: ["raw_record_id"]
            isOneToOne: false
            referencedRelation: "raw_records"
            referencedColumns: ["raw_record_id"]
          },
          {
            foreignKeyName: "repair_entries_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "conversation_threads"
            referencedColumns: ["thread_id"]
          },
        ]
      }
      review_entries: {
        Row: {
          ai_headline: string | null
          ai_reflection_json: Json | null
          ai_reflection_version: number | null
          ai_tier: string | null
          ask_before_understanding: string | null
          body_location: string | null
          calibration_block: Json | null
          completed_at: string | null
          could_make_them_feel: string | null
          created_at: string
          data_and_update: string | null
          deleted_at: string | null
          easier_or_harder: string | null
          feeling_tracking: string | null
          felt_at_hardest_moment: string | null
          first_repair_sentence: string | null
          forecast: string | null
          hardest_moment_feeling: string | null
          impact_to_name: string | null
          interpreted_raw: string | null
          is_complete: boolean
          lesson_about_self: string | null
          lesson_about_them: string | null
          lesson_differently: string | null
          linked_prepare_entry_id: string | null
          needs_to_happen_next: string | null
          next_move: string | null
          observed_in_them: string | null
          observed_raw: string | null
          outcome_json: Json | null
          pattern_tag: string | null
          person_id: string | null
          pressure_vs_care: string | null
          raw_record_id: string | null
          repair_branch_active: boolean
          review_depth: string | null
          review_entry_id: string
          secret_want: string | null
          signs_how_they_left: string | null
          something_that_helped: string | null
          their_experience: string | null
          their_in_moment_experience: string | null
          their_need_first: string | null
          thread_id: string | null
          timing_now: boolean | null
          timing_when: string | null
          treat_as_data: string | null
          turning_point: string | null
          unresolved_and_next: string | null
          user_id: string
          validated_assumptions: string | null
          what_else_explains: string | null
          what_happened: string | null
          what_helped: string | null
          what_hurt: string | null
          what_protecting: string | null
          what_protecting_text: string | null
          what_read_missed: string | null
          what_you_avoided: string | null
          what_you_did: string | null
          your_part: string | null
        }
        Insert: {
          ai_headline?: string | null
          ai_reflection_json?: Json | null
          ai_reflection_version?: number | null
          ai_tier?: string | null
          ask_before_understanding?: string | null
          body_location?: string | null
          calibration_block?: Json | null
          completed_at?: string | null
          could_make_them_feel?: string | null
          created_at?: string
          data_and_update?: string | null
          deleted_at?: string | null
          easier_or_harder?: string | null
          feeling_tracking?: string | null
          felt_at_hardest_moment?: string | null
          first_repair_sentence?: string | null
          forecast?: string | null
          hardest_moment_feeling?: string | null
          impact_to_name?: string | null
          interpreted_raw?: string | null
          is_complete?: boolean
          lesson_about_self?: string | null
          lesson_about_them?: string | null
          lesson_differently?: string | null
          linked_prepare_entry_id?: string | null
          needs_to_happen_next?: string | null
          next_move?: string | null
          observed_in_them?: string | null
          observed_raw?: string | null
          outcome_json?: Json | null
          pattern_tag?: string | null
          person_id?: string | null
          pressure_vs_care?: string | null
          raw_record_id?: string | null
          repair_branch_active?: boolean
          review_depth?: string | null
          review_entry_id?: string
          secret_want?: string | null
          signs_how_they_left?: string | null
          something_that_helped?: string | null
          their_experience?: string | null
          their_in_moment_experience?: string | null
          their_need_first?: string | null
          thread_id?: string | null
          timing_now?: boolean | null
          timing_when?: string | null
          treat_as_data?: string | null
          turning_point?: string | null
          unresolved_and_next?: string | null
          user_id: string
          validated_assumptions?: string | null
          what_else_explains?: string | null
          what_happened?: string | null
          what_helped?: string | null
          what_hurt?: string | null
          what_protecting?: string | null
          what_protecting_text?: string | null
          what_read_missed?: string | null
          what_you_avoided?: string | null
          what_you_did?: string | null
          your_part?: string | null
        }
        Update: {
          ai_headline?: string | null
          ai_reflection_json?: Json | null
          ai_reflection_version?: number | null
          ai_tier?: string | null
          ask_before_understanding?: string | null
          body_location?: string | null
          calibration_block?: Json | null
          completed_at?: string | null
          could_make_them_feel?: string | null
          created_at?: string
          data_and_update?: string | null
          deleted_at?: string | null
          easier_or_harder?: string | null
          feeling_tracking?: string | null
          felt_at_hardest_moment?: string | null
          first_repair_sentence?: string | null
          forecast?: string | null
          hardest_moment_feeling?: string | null
          impact_to_name?: string | null
          interpreted_raw?: string | null
          is_complete?: boolean
          lesson_about_self?: string | null
          lesson_about_them?: string | null
          lesson_differently?: string | null
          linked_prepare_entry_id?: string | null
          needs_to_happen_next?: string | null
          next_move?: string | null
          observed_in_them?: string | null
          observed_raw?: string | null
          outcome_json?: Json | null
          pattern_tag?: string | null
          person_id?: string | null
          pressure_vs_care?: string | null
          raw_record_id?: string | null
          repair_branch_active?: boolean
          review_depth?: string | null
          review_entry_id?: string
          secret_want?: string | null
          signs_how_they_left?: string | null
          something_that_helped?: string | null
          their_experience?: string | null
          their_in_moment_experience?: string | null
          their_need_first?: string | null
          thread_id?: string | null
          timing_now?: boolean | null
          timing_when?: string | null
          treat_as_data?: string | null
          turning_point?: string | null
          unresolved_and_next?: string | null
          user_id?: string
          validated_assumptions?: string | null
          what_else_explains?: string | null
          what_happened?: string | null
          what_helped?: string | null
          what_hurt?: string | null
          what_protecting?: string | null
          what_protecting_text?: string | null
          what_read_missed?: string | null
          what_you_avoided?: string | null
          what_you_did?: string | null
          your_part?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "review_entries_linked_prepare_entry_id_fkey"
            columns: ["linked_prepare_entry_id"]
            isOneToOne: false
            referencedRelation: "prepare_entries"
            referencedColumns: ["prepare_entry_id"]
          },
          {
            foreignKeyName: "review_entries_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "review_entries_raw_record_id_fkey"
            columns: ["raw_record_id"]
            isOneToOne: false
            referencedRelation: "raw_records"
            referencedColumns: ["raw_record_id"]
          },
          {
            foreignKeyName: "review_entries_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "conversation_threads"
            referencedColumns: ["thread_id"]
          },
        ]
      }
      trigger_entries: {
        Row: {
          after_feeling: string | null
          ai_response_json: Json | null
          behavior: string | null
          completed_at: string | null
          created_at: string
          deleted_at: string | null
          emotion: string | null
          emotion_intensity: number | null
          event_text: string | null
          interpretation: string | null
          is_complete: boolean
          learning: string | null
          outcome: string | null
          person_id: string | null
          raw_record_id: string | null
          thread_id: string | null
          trigger_entry_id: string
          urge: string | null
          urge_intensity: number | null
          user_id: string
        }
        Insert: {
          after_feeling?: string | null
          ai_response_json?: Json | null
          behavior?: string | null
          completed_at?: string | null
          created_at?: string
          deleted_at?: string | null
          emotion?: string | null
          emotion_intensity?: number | null
          event_text?: string | null
          interpretation?: string | null
          is_complete?: boolean
          learning?: string | null
          outcome?: string | null
          person_id?: string | null
          raw_record_id?: string | null
          thread_id?: string | null
          trigger_entry_id?: string
          urge?: string | null
          urge_intensity?: number | null
          user_id: string
        }
        Update: {
          after_feeling?: string | null
          ai_response_json?: Json | null
          behavior?: string | null
          completed_at?: string | null
          created_at?: string
          deleted_at?: string | null
          emotion?: string | null
          emotion_intensity?: number | null
          event_text?: string | null
          interpretation?: string | null
          is_complete?: boolean
          learning?: string | null
          outcome?: string | null
          person_id?: string | null
          raw_record_id?: string | null
          thread_id?: string | null
          trigger_entry_id?: string
          urge?: string | null
          urge_intensity?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trigger_entries_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "trigger_entries_raw_record_id_fkey"
            columns: ["raw_record_id"]
            isOneToOne: false
            referencedRelation: "raw_records"
            referencedColumns: ["raw_record_id"]
          },
          {
            foreignKeyName: "trigger_entries_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "conversation_threads"
            referencedColumns: ["thread_id"]
          },
        ]
      }
      user_feature_flags: {
        Row: {
          created_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          created_at: string
          primary_profile: string
          profile_snapshot_id: string
          routing_output: Json
          scoring_version: number
          secondary_profile: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          primary_profile: string
          profile_snapshot_id?: string
          routing_output?: Json
          scoring_version?: number
          secondary_profile?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          primary_profile?: string
          profile_snapshot_id?: string
          routing_output?: Json
          scoring_version?: number
          secondary_profile?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_subscriptions: {
        Row: {
          activated_at: string | null
          cancelled_at: string | null
          created_at: string
          free_before_you_send_used_at: string | null
          free_prepare_used_at: string | null
          free_pulse_check_used_at: string | null
          free_review_used_at: string | null
          role: string
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_id: string
          trial_ends_at: string | null
          trial_started_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          activated_at?: string | null
          cancelled_at?: string | null
          created_at?: string
          free_before_you_send_used_at?: string | null
          free_prepare_used_at?: string | null
          free_pulse_check_used_at?: string | null
          free_review_used_at?: string | null
          role?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_id?: string
          trial_ends_at?: string | null
          trial_started_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          activated_at?: string | null
          cancelled_at?: string | null
          created_at?: string
          free_before_you_send_used_at?: string | null
          free_prepare_used_at?: string | null
          free_pulse_check_used_at?: string | null
          free_review_used_at?: string | null
          role?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_id?: string
          trial_ends_at?: string | null
          trial_started_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      weekly_reflections: {
        Row: {
          ai_duration_ms: number
          ai_json: Json
          generated_at: string
          generator_version: string
          input_entry_count: number
          input_window_days: number
          period_end: string
          period_start: string
          prompt_version: string
          reflection_id: string
          user_id: string
        }
        Insert: {
          ai_duration_ms: number
          ai_json: Json
          generated_at?: string
          generator_version: string
          input_entry_count: number
          input_window_days?: number
          period_end: string
          period_start: string
          prompt_version: string
          reflection_id?: string
          user_id: string
        }
        Update: {
          ai_duration_ms?: number
          ai_json?: Json
          generated_at?: string
          generator_version?: string
          input_entry_count?: number
          input_window_days?: number
          period_end?: string
          period_start?: string
          prompt_version?: string
          reflection_id?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      grant_coins: {
        Args: {
          p_user_id: string
          p_amount: number
          p_reason: string
          p_ref_key: string | null
        }
        Returns: string
      }
      spend_coins: {
        Args: {
          p_user_id: string
          p_amount: number
          p_reason: string
          p_ref_key: string | null
        }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const

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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string | null
          id: string
          payload: Json | null
          target_collection: string | null
          target_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string | null
          id?: string
          payload?: Json | null
          target_collection?: string | null
          target_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string | null
          id?: string
          payload?: Json | null
          target_collection?: string | null
          target_id?: string | null
        }
        Relationships: []
      }
      billing_logs: {
        Row: {
          created_at: string | null
          error_code: string | null
          error_message: string | null
          event_type: string
          id: string
          request_body: Json | null
          response_body: Json | null
          stripe_event_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          error_code?: string | null
          error_message?: string | null
          event_type: string
          id?: string
          request_body?: Json | null
          response_body?: Json | null
          stripe_event_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          error_code?: string | null
          error_message?: string | null
          event_type?: string
          id?: string
          request_body?: Json | null
          response_body?: Json | null
          stripe_event_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "billing_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cancellation_feedback: {
        Row: {
          about_user_id: string
          created_at: string
          feedback: string | null
          from_user_id: string
          id: string
          trip_id: string
        }
        Insert: {
          about_user_id: string
          created_at?: string
          feedback?: string | null
          from_user_id: string
          id?: string
          trip_id: string
        }
        Update: {
          about_user_id?: string
          created_at?: string
          feedback?: string | null
          from_user_id?: string
          id?: string
          trip_id?: string
        }
        Relationships: []
      }
      cancellation_stats: {
        Row: {
          badge_tier: string
          driver_90d_cancels: number
          driver_90d_committed: number
          driver_cancels_chargeable: number
          driver_lifetime_cancels: number
          driver_lifetime_committed: number
          driver_rate_90d: number
          driver_rate_lifetime: number
          driver_total_committed: number
          rider_90d_cancels: number
          rider_90d_committed: number
          rider_cancels_chargeable: number
          rider_lifetime_cancels: number
          rider_lifetime_committed: number
          rider_rate_90d: number
          rider_rate_lifetime: number
          rider_total_committed: number
          updated_at: string
          user_id: string
        }
        Insert: {
          badge_tier?: string
          driver_90d_cancels?: number
          driver_90d_committed?: number
          driver_cancels_chargeable?: number
          driver_lifetime_cancels?: number
          driver_lifetime_committed?: number
          driver_rate_90d?: number
          driver_rate_lifetime?: number
          driver_total_committed?: number
          rider_90d_cancels?: number
          rider_90d_committed?: number
          rider_cancels_chargeable?: number
          rider_lifetime_cancels?: number
          rider_lifetime_committed?: number
          rider_rate_90d?: number
          rider_rate_lifetime?: number
          rider_total_committed?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          badge_tier?: string
          driver_90d_cancels?: number
          driver_90d_committed?: number
          driver_cancels_chargeable?: number
          driver_lifetime_cancels?: number
          driver_lifetime_committed?: number
          driver_rate_90d?: number
          driver_rate_lifetime?: number
          driver_total_committed?: number
          rider_90d_cancels?: number
          rider_90d_committed?: number
          rider_cancels_chargeable?: number
          rider_lifetime_cancels?: number
          rider_lifetime_committed?: number
          rider_rate_90d?: number
          rider_rate_lifetime?: number
          rider_total_committed?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      cancellations: {
        Row: {
          created_at: string
          event_id: string
          is_chargeable: boolean
          reason_code: Database["public"]["Enums"]["cancel_reason_code"]
          role: string
          timestamp: string
          trip_id: string
          user_id: string
          weight: number
        }
        Insert: {
          created_at?: string
          event_id?: string
          is_chargeable?: boolean
          reason_code: Database["public"]["Enums"]["cancel_reason_code"]
          role: string
          timestamp?: string
          trip_id: string
          user_id: string
          weight?: number
        }
        Update: {
          created_at?: string
          event_id?: string
          is_chargeable?: boolean
          reason_code?: Database["public"]["Enums"]["cancel_reason_code"]
          role?: string
          timestamp?: string
          trip_id?: string
          user_id?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "cancellations_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "ride_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      community_messages: {
        Row: {
          created_at: string | null
          id: string
          message: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          message: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          message?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      counter_offers: {
        Row: {
          amount: number
          by_user_id: string
          created_at: string | null
          id: string
          message: string | null
          ride_request_id: string
          role: string
          status: string
        }
        Insert: {
          amount: number
          by_user_id: string
          created_at?: string | null
          id?: string
          message?: string | null
          ride_request_id: string
          role: string
          status?: string
        }
        Update: {
          amount?: number
          by_user_id?: string
          created_at?: string | null
          id?: string
          message?: string | null
          ride_request_id?: string
          role?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "counter_offers_ride_request_id_fkey"
            columns: ["ride_request_id"]
            isOneToOne: false
            referencedRelation: "ride_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_status: {
        Row: {
          approx_geo: Json | null
          current_zip: string | null
          state: string
          updated_at: string
          user_id: string
        }
        Insert: {
          approx_geo?: Json | null
          current_zip?: string | null
          state?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          approx_geo?: Json | null
          current_zip?: string | null
          state?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      kyc_submissions: {
        Row: {
          back_image_url: string | null
          front_image_url: string | null
          id: string
          notes: string | null
          reviewed_at: string | null
          reviewer_id: string | null
          role: string
          selfie_image_url: string | null
          status: string
          submitted_at: string
          user_email: string
          user_id: string
        }
        Insert: {
          back_image_url?: string | null
          front_image_url?: string | null
          id?: string
          notes?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          role: string
          selfie_image_url?: string | null
          status?: string
          submitted_at?: string
          user_email: string
          user_id: string
        }
        Update: {
          back_image_url?: string | null
          front_image_url?: string | null
          id?: string
          notes?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          role?: string
          selfie_image_url?: string | null
          status?: string
          submitted_at?: string
          user_email?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string | null
          id: string
          link: string | null
          message: string
          read: boolean | null
          related_ride_id: string | null
          related_user_id: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          link?: string | null
          message: string
          read?: boolean | null
          related_ride_id?: string | null
          related_user_id?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          link?: string | null
          message?: string
          read?: boolean | null
          related_ride_id?: string | null
          related_user_id?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_related_ride_id_fkey"
            columns: ["related_ride_id"]
            isOneToOne: false
            referencedRelation: "ride_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_related_user_id_fkey"
            columns: ["related_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active_assigned_ride_id: string | null
          active_role: string | null
          admin_locked_fields: string[] | null
          bio: string | null
          blocked: boolean | null
          blocked_until: string | null
          completed_trips_count: number | null
          consecutive_cancellations: number | null
          created_at: string | null
          current_lat: number | null
          current_lng: number | null
          display_name: string | null
          driver_rating_avg: number | null
          driver_rating_count: number | null
          email: string
          free_uses_remaining: number | null
          full_name: string | null
          id: string
          id_image_url: string | null
          is_driver: boolean | null
          is_member: boolean | null
          is_rider: boolean | null
          is_verified: boolean | null
          location_sharing_enabled: boolean | null
          location_updated_at: string | null
          notification_preferences: Json | null
          notify_new_driver: boolean | null
          paused: boolean | null
          phone_number: string | null
          photo_url: string | null
          profile_zip: string | null
          profile_zip_updated_at: string | null
          rider_rating_avg: number | null
          rider_rating_count: number | null
          role_set_at: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_active: boolean | null
          subscription_current_period_end: number | null
          subscription_expires_at: string | null
          subscription_started_at: string | null
          subscription_status: string | null
          updated_at: string | null
          verification_notes: string | null
          verification_reviewed_at: string | null
          verification_reviewer_id: string | null
          verification_status:
            | Database["public"]["Enums"]["verification_status"]
            | null
          verification_submitted_at: string | null
          warning_count: number | null
        }
        Insert: {
          active_assigned_ride_id?: string | null
          active_role?: string | null
          admin_locked_fields?: string[] | null
          bio?: string | null
          blocked?: boolean | null
          blocked_until?: string | null
          completed_trips_count?: number | null
          consecutive_cancellations?: number | null
          created_at?: string | null
          current_lat?: number | null
          current_lng?: number | null
          display_name?: string | null
          driver_rating_avg?: number | null
          driver_rating_count?: number | null
          email: string
          free_uses_remaining?: number | null
          full_name?: string | null
          id: string
          id_image_url?: string | null
          is_driver?: boolean | null
          is_member?: boolean | null
          is_rider?: boolean | null
          is_verified?: boolean | null
          location_sharing_enabled?: boolean | null
          location_updated_at?: string | null
          notification_preferences?: Json | null
          notify_new_driver?: boolean | null
          paused?: boolean | null
          phone_number?: string | null
          photo_url?: string | null
          profile_zip?: string | null
          profile_zip_updated_at?: string | null
          rider_rating_avg?: number | null
          rider_rating_count?: number | null
          role_set_at?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_active?: boolean | null
          subscription_current_period_end?: number | null
          subscription_expires_at?: string | null
          subscription_started_at?: string | null
          subscription_status?: string | null
          updated_at?: string | null
          verification_notes?: string | null
          verification_reviewed_at?: string | null
          verification_reviewer_id?: string | null
          verification_status?:
            | Database["public"]["Enums"]["verification_status"]
            | null
          verification_submitted_at?: string | null
          warning_count?: number | null
        }
        Update: {
          active_assigned_ride_id?: string | null
          active_role?: string | null
          admin_locked_fields?: string[] | null
          bio?: string | null
          blocked?: boolean | null
          blocked_until?: string | null
          completed_trips_count?: number | null
          consecutive_cancellations?: number | null
          created_at?: string | null
          current_lat?: number | null
          current_lng?: number | null
          display_name?: string | null
          driver_rating_avg?: number | null
          driver_rating_count?: number | null
          email?: string
          free_uses_remaining?: number | null
          full_name?: string | null
          id?: string
          id_image_url?: string | null
          is_driver?: boolean | null
          is_member?: boolean | null
          is_rider?: boolean | null
          is_verified?: boolean | null
          location_sharing_enabled?: boolean | null
          location_updated_at?: string | null
          notification_preferences?: Json | null
          notify_new_driver?: boolean | null
          paused?: boolean | null
          phone_number?: string | null
          photo_url?: string | null
          profile_zip?: string | null
          profile_zip_updated_at?: string | null
          rider_rating_avg?: number | null
          rider_rating_count?: number | null
          role_set_at?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_active?: boolean | null
          subscription_current_period_end?: number | null
          subscription_expires_at?: string | null
          subscription_started_at?: string | null
          subscription_status?: string | null
          updated_at?: string | null
          verification_notes?: string | null
          verification_reviewed_at?: string | null
          verification_reviewer_id?: string | null
          verification_status?:
            | Database["public"]["Enums"]["verification_status"]
            | null
          verification_submitted_at?: string | null
          warning_count?: number | null
        }
        Relationships: []
      }
      ride_locations: {
        Row: {
          id: string
          lat: number
          lng: number
          ride_request_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          id?: string
          lat: number
          lng: number
          ride_request_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          id?: string
          lat?: number
          lng?: number
          ride_request_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ride_locations_ride_request_id_fkey"
            columns: ["ride_request_id"]
            isOneToOne: false
            referencedRelation: "ride_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      ride_messages: {
        Row: {
          attachment_url: string | null
          created_at: string | null
          id: string
          ride_request_id: string
          sender_id: string
          text: string
        }
        Insert: {
          attachment_url?: string | null
          created_at?: string | null
          id?: string
          ride_request_id: string
          sender_id: string
          text: string
        }
        Update: {
          attachment_url?: string | null
          created_at?: string | null
          id?: string
          ride_request_id?: string
          sender_id?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "ride_messages_ride_request_id_fkey"
            columns: ["ride_request_id"]
            isOneToOne: false
            referencedRelation: "ride_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      ride_requests: {
        Row: {
          assigned_driver_id: string | null
          cancel_reason_code:
            | Database["public"]["Enums"]["cancel_reason_code"]
            | null
          cancel_reason_driver: string | null
          cancel_reason_rider: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string | null
          driver_completed: boolean | null
          driver_rating: number | null
          dropoff_address: string
          dropoff_lat: number
          dropoff_lng: number
          dropoff_zip: string
          eta_minutes: number | null
          id: string
          pickup_address: string
          pickup_lat: number
          pickup_lng: number
          pickup_time: string
          pickup_zip: string
          price_offer: number | null
          rider_completed: boolean | null
          rider_id: string
          rider_note: string | null
          rider_note_image_url: string | null
          rider_rating: number | null
          search_keywords: string[] | null
          status: Database["public"]["Enums"]["ride_status"] | null
          updated_at: string | null
        }
        Insert: {
          assigned_driver_id?: string | null
          cancel_reason_code?:
            | Database["public"]["Enums"]["cancel_reason_code"]
            | null
          cancel_reason_driver?: string | null
          cancel_reason_rider?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string | null
          driver_completed?: boolean | null
          driver_rating?: number | null
          dropoff_address: string
          dropoff_lat: number
          dropoff_lng: number
          dropoff_zip: string
          eta_minutes?: number | null
          id?: string
          pickup_address: string
          pickup_lat: number
          pickup_lng: number
          pickup_time: string
          pickup_zip: string
          price_offer?: number | null
          rider_completed?: boolean | null
          rider_id: string
          rider_note?: string | null
          rider_note_image_url?: string | null
          rider_rating?: number | null
          search_keywords?: string[] | null
          status?: Database["public"]["Enums"]["ride_status"] | null
          updated_at?: string | null
        }
        Update: {
          assigned_driver_id?: string | null
          cancel_reason_code?:
            | Database["public"]["Enums"]["cancel_reason_code"]
            | null
          cancel_reason_driver?: string | null
          cancel_reason_rider?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string | null
          driver_completed?: boolean | null
          driver_rating?: number | null
          dropoff_address?: string
          dropoff_lat?: number
          dropoff_lng?: number
          dropoff_zip?: string
          eta_minutes?: number | null
          id?: string
          pickup_address?: string
          pickup_lat?: number
          pickup_lng?: number
          pickup_time?: string
          pickup_zip?: string
          price_offer?: number | null
          rider_completed?: boolean | null
          rider_id?: string
          rider_note?: string | null
          rider_note_image_url?: string | null
          rider_rating?: number | null
          search_keywords?: string[] | null
          status?: Database["public"]["Enums"]["ride_status"] | null
          updated_at?: string | null
        }
        Relationships: []
      }
      support_tickets: {
        Row: {
          body: string
          created_at: string | null
          id: string
          status: string | null
          subject: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string | null
          id?: string
          status?: string | null
          subject: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string | null
          id?: string
          status?: string | null
          subject?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_message_flags: {
        Row: {
          content_id: string
          content_type: string
          created_at: string | null
          flag_reason: string
          flagged_content: string
          id: string
          user_id: string
        }
        Insert: {
          content_id: string
          content_type: string
          created_at?: string | null
          flag_reason: string
          flagged_content: string
          id?: string
          user_id: string
        }
        Update: {
          content_id?: string
          content_type?: string
          created_at?: string | null
          flag_reason?: string
          flagged_content?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_message_flags_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_public_stats: {
        Row: {
          driver_rating_avg: number
          driver_rating_count: number
          rider_rating_avg: number
          rider_rating_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          driver_rating_avg?: number
          driver_rating_count?: number
          rider_rating_avg?: number
          rider_rating_count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          driver_rating_avg?: number
          driver_rating_count?: number
          rider_rating_avg?: number
          rider_rating_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_ride_atomic: {
        Args: {
          p_driver_id: string
          p_eta_minutes: number
          p_ride_id: string
          p_skip_active_check?: boolean
        }
        Returns: Json
      }
      calculate_cancel_weight: {
        Args: {
          p_cancelled_at: string
          p_pickup_time: string
          p_reason_code: Database["public"]["Enums"]["cancel_reason_code"]
        }
        Returns: number
      }
      can_use_trip_features: { Args: { p_user_id: string }; Returns: boolean }
      can_view_contact_info: {
        Args: { _profile_id: string; _viewer_id: string }
        Returns: boolean
      }
      check_active_ride: { Args: { _user_id: string }; Returns: boolean }
      create_notification: {
        Args: {
          p_link?: string
          p_message: string
          p_related_ride_id?: string
          p_related_user_id?: string
          p_title: string
          p_type: string
          p_user_id: string
        }
        Returns: string
      }
      get_safe_profile_for_open_ride: {
        Args: { _profile_id: string }
        Returns: {
          display_name: string
          id: string
          photo_url: string
          rider_rating_avg: number
          rider_rating_count: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_cancel_chargeable: {
        Args: {
          p_accepted_at: string
          p_cancelled_at: string
          p_cancelled_by: string
          p_pickup_time: string
          p_reason_code: Database["public"]["Enums"]["cancel_reason_code"]
          p_trip_id: string
        }
        Returns: boolean
      }
      is_ride_participant: {
        Args: { _profile_id: string; _user_id: string }
        Returns: boolean
      }
      is_valid_zip: { Args: { zip_input: string }; Returns: boolean }
      is_verified_rider: { Args: { _user_id: string }; Returns: boolean }
      is_verified_user: { Args: { _user_id: string }; Returns: boolean }
      normalize_zip: { Args: { zip_input: string }; Returns: string }
      recalculate_all_cancellation_stats: { Args: never; Returns: undefined }
      update_cancellation_stats: {
        Args: { p_role: string; p_user_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "driver" | "rider"
      cancel_reason_code:
        | "rider_changed_mind"
        | "driver_unavailable"
        | "price_dispute"
        | "no_show"
        | "late"
        | "duplicate_request"
        | "safety"
        | "weather"
        | "system_timeout"
        | "other"
      ride_status: "open" | "assigned" | "completed" | "cancelled"
      verification_status: "pending" | "approved" | "rejected"
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
      app_role: ["admin", "driver", "rider"],
      cancel_reason_code: [
        "rider_changed_mind",
        "driver_unavailable",
        "price_dispute",
        "no_show",
        "late",
        "duplicate_request",
        "safety",
        "weather",
        "system_timeout",
        "other",
      ],
      ride_status: ["open", "assigned", "completed", "cancelled"],
      verification_status: ["pending", "approved", "rejected"],
    },
  },
} as const

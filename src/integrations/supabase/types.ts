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
      counter_offers: {
        Row: {
          amount: number
          by_user_id: string
          created_at: string | null
          id: string
          message: string | null
          ride_request_id: string
          role: string
        }
        Insert: {
          amount: number
          by_user_id: string
          created_at?: string | null
          id?: string
          message?: string | null
          ride_request_id: string
          role: string
        }
        Update: {
          amount?: number
          by_user_id?: string
          created_at?: string | null
          id?: string
          message?: string | null
          ride_request_id?: string
          role?: string
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
      profiles: {
        Row: {
          active_assigned_ride_id: string | null
          bio: string | null
          blocked: boolean | null
          blocked_until: string | null
          created_at: string | null
          display_name: string | null
          driver_rating_avg: number | null
          driver_rating_count: number | null
          email: string
          full_name: string | null
          id: string
          id_image_url: string | null
          is_driver: boolean | null
          is_rider: boolean | null
          is_verified: boolean | null
          phone_number: string | null
          photo_url: string | null
          rider_rating_avg: number | null
          rider_rating_count: number | null
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
          bio?: string | null
          blocked?: boolean | null
          blocked_until?: string | null
          created_at?: string | null
          display_name?: string | null
          driver_rating_avg?: number | null
          driver_rating_count?: number | null
          email: string
          full_name?: string | null
          id: string
          id_image_url?: string | null
          is_driver?: boolean | null
          is_rider?: boolean | null
          is_verified?: boolean | null
          phone_number?: string | null
          photo_url?: string | null
          rider_rating_avg?: number | null
          rider_rating_count?: number | null
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
          bio?: string | null
          blocked?: boolean | null
          blocked_until?: string | null
          created_at?: string | null
          display_name?: string | null
          driver_rating_avg?: number | null
          driver_rating_count?: number | null
          email?: string
          full_name?: string | null
          id?: string
          id_image_url?: string | null
          is_driver?: boolean | null
          is_rider?: boolean | null
          is_verified?: boolean | null
          phone_number?: string | null
          photo_url?: string | null
          rider_rating_avg?: number | null
          rider_rating_count?: number | null
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "driver" | "rider"
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
      ride_status: ["open", "assigned", "completed", "cancelled"],
      verification_status: ["pending", "approved", "rejected"],
    },
  },
} as const

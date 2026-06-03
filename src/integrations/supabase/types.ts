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
      alarms: {
        Row: {
          acknowledged: boolean | null
          acknowledged_at: string | null
          alarm_type: string | null
          created_at: string
          email_sent: boolean | null
          id: string
          label: string | null
          message: string | null
          section: string | null
          tag_config_id: string | null
          tag_id: string
          unit: string | null
          value: number | null
        }
        Insert: {
          acknowledged?: boolean | null
          acknowledged_at?: string | null
          alarm_type?: string | null
          created_at?: string
          email_sent?: boolean | null
          id?: string
          label?: string | null
          message?: string | null
          section?: string | null
          tag_config_id?: string | null
          tag_id: string
          unit?: string | null
          value?: number | null
        }
        Update: {
          acknowledged?: boolean | null
          acknowledged_at?: string | null
          alarm_type?: string | null
          created_at?: string
          email_sent?: boolean | null
          id?: string
          label?: string | null
          message?: string | null
          section?: string | null
          tag_config_id?: string | null
          tag_id?: string
          unit?: string | null
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "alarms_tag_config_id_fkey"
            columns: ["tag_config_id"]
            isOneToOne: false
            referencedRelation: "tag_config"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_conversations: {
        Row: {
          created_at: string
          id: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          content: string | null
          conversation_id: string
          created_at: string
          deleted: boolean | null
          id: string
          role: string
          suggestions: Json | null
          user_id: string
        }
        Insert: {
          content?: string | null
          conversation_id: string
          created_at?: string
          deleted?: boolean | null
          id?: string
          role: string
          suggestions?: Json | null
          user_id: string
        }
        Update: {
          content?: string | null
          conversation_id?: string
          created_at?: string
          deleted?: boolean | null
          id?: string
          role?: string
          suggestions?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      consumption_data: {
        Row: {
          created_at: string
          daily_consumption: number | null
          date: string
          hour: number | null
          hourly_consumption: number | null
          id: string
          section: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          daily_consumption?: number | null
          date: string
          hour?: number | null
          hourly_consumption?: number | null
          id?: string
          section: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          daily_consumption?: number | null
          date?: string
          hour?: number | null
          hourly_consumption?: number | null
          id?: string
          section?: string
          updated_at?: string
        }
        Relationships: []
      }
      data_exports: {
        Row: {
          cleanup_done: boolean | null
          created_at: string
          downloaded: boolean | null
          email_sent: boolean | null
          file_path: string | null
          id: string
          period_end: string
          period_start: string
          record_count: number | null
          status: string | null
        }
        Insert: {
          cleanup_done?: boolean | null
          created_at?: string
          downloaded?: boolean | null
          email_sent?: boolean | null
          file_path?: string | null
          id?: string
          period_end: string
          period_start: string
          record_count?: number | null
          status?: string | null
        }
        Update: {
          cleanup_done?: boolean | null
          created_at?: string
          downloaded?: boolean | null
          email_sent?: boolean | null
          file_path?: string | null
          id?: string
          period_end?: string
          period_start?: string
          record_count?: number | null
          status?: string | null
        }
        Relationships: []
      }
      historian_aggregates: {
        Row: {
          avg_value: number | null
          bucket_size: string | null
          bucket_start: string
          created_at: string
          id: string
          max_value: number | null
          min_value: number | null
          sample_count: number | null
          section: string
          tag_id: string
        }
        Insert: {
          avg_value?: number | null
          bucket_size?: string | null
          bucket_start: string
          created_at?: string
          id?: string
          max_value?: number | null
          min_value?: number | null
          sample_count?: number | null
          section: string
          tag_id: string
        }
        Update: {
          avg_value?: number | null
          bucket_size?: string | null
          bucket_start?: string
          created_at?: string
          id?: string
          max_value?: number | null
          min_value?: number | null
          sample_count?: number | null
          section?: string
          tag_id?: string
        }
        Relationships: []
      }
      historian_logs: {
        Row: {
          id: string
          mqtt_topic: string | null
          section: string | null
          source: string | null
          tag_config_id: string | null
          tag_id: string
          timestamp: string
          value: number | null
        }
        Insert: {
          id?: string
          mqtt_topic?: string | null
          section?: string | null
          source?: string | null
          tag_config_id?: string | null
          tag_id: string
          timestamp?: string
          value?: number | null
        }
        Update: {
          id?: string
          mqtt_topic?: string | null
          section?: string | null
          source?: string | null
          tag_config_id?: string | null
          tag_id?: string
          timestamp?: string
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "historian_logs_tag_config_id_fkey"
            columns: ["tag_config_id"]
            isOneToOne: false
            referencedRelation: "tag_config"
            referencedColumns: ["id"]
          },
        ]
      }
      mqtt_config: {
        Row: {
          auto_connect: boolean | null
          broker_url: string | null
          client_id: string | null
          created_at: string
          id: string
          intake_topic: string | null
          is_connected: boolean | null
          last_connected_at: string | null
          oht_topic: string | null
          oht_topic_2: string | null
          oht_topic_3: string | null
          updated_at: string
          wtp_topic: string | null
        }
        Insert: {
          auto_connect?: boolean | null
          broker_url?: string | null
          client_id?: string | null
          created_at?: string
          id?: string
          intake_topic?: string | null
          is_connected?: boolean | null
          last_connected_at?: string | null
          oht_topic?: string | null
          oht_topic_2?: string | null
          oht_topic_3?: string | null
          updated_at?: string
          wtp_topic?: string | null
        }
        Update: {
          auto_connect?: boolean | null
          broker_url?: string | null
          client_id?: string | null
          created_at?: string
          id?: string
          intake_topic?: string | null
          is_connected?: boolean | null
          last_connected_at?: string | null
          oht_topic?: string | null
          oht_topic_2?: string | null
          oht_topic_3?: string | null
          updated_at?: string
          wtp_topic?: string | null
        }
        Relationships: []
      }
      plant_config: {
        Row: {
          created_at: string
          export_emails: string[] | null
          id: string
          plant_name: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          export_emails?: string[] | null
          id?: string
          plant_name?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          export_emails?: string[] | null
          id?: string
          plant_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pump_analytics: {
        Row: {
          created_at: string
          current_state: boolean | null
          date: string
          id: string
          last_state_change: string | null
          pump_id: string
          runtime_seconds: number | null
          section: string
          start_count: number | null
          total_runtime_seconds: number | null
          total_start_count: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_state?: boolean | null
          date: string
          id?: string
          last_state_change?: string | null
          pump_id: string
          runtime_seconds?: number | null
          section: string
          start_count?: number | null
          total_runtime_seconds?: number | null
          total_start_count?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_state?: boolean | null
          date?: string
          id?: string
          last_state_change?: string | null
          pump_id?: string
          runtime_seconds?: number | null
          section?: string
          start_count?: number | null
          total_runtime_seconds?: number | null
          total_start_count?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      tag_config: {
        Row: {
          activated_at: string | null
          alarm_emails: string[] | null
          alarm_enabled: boolean | null
          created_at: string
          high_setpoint: number | null
          id: string
          is_active: boolean | null
          label: string | null
          low_setpoint: number | null
          section: string
          tag_id: string
          unit: string | null
          updated_at: string
        }
        Insert: {
          activated_at?: string | null
          alarm_emails?: string[] | null
          alarm_enabled?: boolean | null
          created_at?: string
          high_setpoint?: number | null
          id?: string
          is_active?: boolean | null
          label?: string | null
          low_setpoint?: number | null
          section: string
          tag_id: string
          unit?: string | null
          updated_at?: string
        }
        Update: {
          activated_at?: string | null
          alarm_emails?: string[] | null
          alarm_enabled?: boolean | null
          created_at?: string
          high_setpoint?: number | null
          id?: string
          is_active?: boolean | null
          label?: string | null
          low_setpoint?: number | null
          section?: string
          tag_id?: string
          unit?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
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
      app_role: "admin" | "operator" | "viewer"
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
      app_role: ["admin", "operator", "viewer"],
    },
  },
} as const

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
      chatbot_docs: {
        Row: {
          chunk: string
          embedding: string | null
          id: string
          metadata: Json
        }
        Insert: {
          chunk: string
          embedding?: string | null
          id?: string
          metadata?: Json
        }
        Update: {
          chunk?: string
          embedding?: string | null
          id?: string
          metadata?: Json
        }
        Relationships: []
      }
      daily_transits: {
        Row: {
          avg_draft: number | null
          by_flag: Json
          date: string
          vessel_count: number
        }
        Insert: {
          avg_draft?: number | null
          by_flag?: Json
          date: string
          vessel_count?: number
        }
        Update: {
          avg_draft?: number | null
          by_flag?: Json
          date?: string
          vessel_count?: number
        }
        Relationships: []
      }
      data_quality_daily: {
        Row: {
          ais_messages_received: number
          date: string
          notes: string | null
          transponder_silence_flag: boolean
        }
        Insert: {
          ais_messages_received?: number
          date: string
          notes?: string | null
          transponder_silence_flag?: boolean
        }
        Update: {
          ais_messages_received?: number
          date?: string
          notes?: string | null
          transponder_silence_flag?: boolean
        }
        Relationships: []
      }
      events: {
        Row: {
          description: string | null
          id: string
          kind: string
          title: string
          ts: string
        }
        Insert: {
          description?: string | null
          id?: string
          kind: string
          title: string
          ts: string
        }
        Update: {
          description?: string | null
          id?: string
          kind?: string
          title?: string
          ts?: string
        }
        Relationships: []
      }
      flag_mix_daily: {
        Row: {
          count: number
          date: string
          flag: string
          share: number
        }
        Insert: {
          count?: number
          date: string
          flag: string
          share?: number
        }
        Update: {
          count?: number
          date?: string
          flag?: string
          share?: number
        }
        Relationships: []
      }
      petrodollar_daily: {
        Row: {
          brent_usd: number | null
          date: string
          source: string
          wti_usd: number | null
        }
        Insert: {
          brent_usd?: number | null
          date: string
          source: string
          wti_usd?: number | null
        }
        Update: {
          brent_usd?: number | null
          date?: string
          source?: string
          wti_usd?: number | null
        }
        Relationships: []
      }
      positions: {
        Row: {
          cog: number | null
          draft: number | null
          id: number
          inserted_at: string
          lat: number
          lon: number
          mmsi: string
          sog: number | null
          source: Database["public"]["Enums"]["ais_source"]
          ts: string
        }
        Insert: {
          cog?: number | null
          draft?: number | null
          id?: number
          inserted_at?: string
          lat: number
          lon: number
          mmsi: string
          sog?: number | null
          source: Database["public"]["Enums"]["ais_source"]
          ts: string
        }
        Update: {
          cog?: number | null
          draft?: number | null
          id?: number
          inserted_at?: string
          lat?: number
          lon?: number
          mmsi?: string
          sog?: number | null
          source?: Database["public"]["Enums"]["ais_source"]
          ts?: string
        }
        Relationships: [
          {
            foreignKeyName: "positions_mmsi_fkey"
            columns: ["mmsi"]
            isOneToOne: false
            referencedRelation: "vessels"
            referencedColumns: ["mmsi"]
          },
        ]
      }
      throughput_mbd_daily: {
        Row: {
          date: string
          mbd: number
          method: string
        }
        Insert: {
          date: string
          mbd: number
          method: string
        }
        Update: {
          date?: string
          mbd?: number
          method?: string
        }
        Relationships: []
      }
      vessels: {
        Row: {
          built_year: number | null
          dwt: number | null
          flag: string | null
          imo: string | null
          mmsi: string
          name: string | null
          updated_at: string
          vessel_type: string | null
        }
        Insert: {
          built_year?: number | null
          dwt?: number | null
          flag?: string | null
          imo?: string | null
          mmsi: string
          name?: string | null
          updated_at?: string
          vessel_type?: string | null
        }
        Update: {
          built_year?: number | null
          dwt?: number | null
          flag?: string | null
          imo?: string | null
          mmsi?: string
          name?: string | null
          updated_at?: string
          vessel_type?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      ais_source: "ais_live" | "gfw" | "backfill"
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
      ais_source: ["ais_live", "gfw", "backfill"],
    },
  },
} as const

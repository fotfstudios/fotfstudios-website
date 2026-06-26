export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      addons: {
        Row: {
          active: boolean
          amount_clp: number
          id: string
          key: string
          kind: string
          name: string
          rate_plan_id: string
        }
        Insert: {
          active?: boolean
          amount_clp: number
          id?: string
          key: string
          kind?: string
          name: string
          rate_plan_id: string
        }
        Update: {
          active?: boolean
          amount_clp?: number
          id?: string
          key?: string
          kind?: string
          name?: string
          rate_plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "addons_rate_plan_id_fkey"
            columns: ["rate_plan_id"]
            isOneToOne: false
            referencedRelation: "rate_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          active: boolean
          address: string | null
          created_at: string
          id: string
          name: string
          slug: string
          timezone: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          created_at?: string
          id?: string
          name: string
          slug: string
          timezone?: string
        }
        Update: {
          active?: boolean
          address?: string | null
          created_at?: string
          id?: string
          name?: string
          slug?: string
          timezone?: string
        }
        Relationships: []
      }
      opening_hours: {
        Row: {
          close_minute: number
          id: string
          open_minute: number
          resource_id: string
          weekday: number
        }
        Insert: {
          close_minute: number
          id?: string
          open_minute: number
          resource_id: string
          weekday: number
        }
        Update: {
          close_minute?: number
          id?: string
          open_minute?: number
          resource_id?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "opening_hours_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id"]
          },
        ]
      }
      order_lines: {
        Row: {
          addon_key: string | null
          description: string
          id: string
          line_type: string
          order_id: string
          quantity: number
          reservation_id: string | null
          subtotal_clp: number
          unit_price_clp: number
        }
        Insert: {
          addon_key?: string | null
          description: string
          id?: string
          line_type: string
          order_id: string
          quantity?: number
          reservation_id?: string | null
          subtotal_clp: number
          unit_price_clp: number
        }
        Update: {
          addon_key?: string | null
          description?: string
          id?: string
          line_type?: string
          order_id?: string
          quantity?: number
          reservation_id?: string | null
          subtotal_clp?: number
          unit_price_clp?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_lines_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_lines_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          amount_clp: number
          created_at: string
          currency: string
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          id: string
          mp_payment_id: string | null
          mp_preference_id: string | null
          net_clp: number
          paid_at: string | null
          pricing_snapshot: Json | null
          status: Database["public"]["Enums"]["order_status"]
          tax_clp: number
        }
        Insert: {
          amount_clp: number
          created_at?: string
          currency?: string
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          id?: string
          mp_payment_id?: string | null
          mp_preference_id?: string | null
          net_clp: number
          paid_at?: string | null
          pricing_snapshot?: Json | null
          status?: Database["public"]["Enums"]["order_status"]
          tax_clp: number
        }
        Update: {
          amount_clp?: number
          created_at?: string
          currency?: string
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          id?: string
          mp_payment_id?: string | null
          mp_preference_id?: string | null
          net_clp?: number
          paid_at?: string | null
          pricing_snapshot?: Json | null
          status?: Database["public"]["Enums"]["order_status"]
          tax_clp?: number
        }
        Relationships: []
      }
      payment_intents: {
        Row: {
          amount_clp: number
          created_at: string
          currency: string
          id: string
          idempotency_key: string | null
          order_id: string
          payment_id: string | null
          preference_id: string | null
          provider: string
          status: string
        }
        Insert: {
          amount_clp: number
          created_at?: string
          currency?: string
          id?: string
          idempotency_key?: string | null
          order_id: string
          payment_id?: string | null
          preference_id?: string | null
          provider?: string
          status?: string
        }
        Update: {
          amount_clp?: number
          created_at?: string
          currency?: string
          id?: string
          idempotency_key?: string | null
          order_id?: string
          payment_id?: string | null
          preference_id?: string | null
          provider?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_intents_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      price_books: {
        Row: {
          created_at: string
          id: string
          name: string
          status: Database["public"]["Enums"]["price_book_status"]
          valid_from: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          status?: Database["public"]["Enums"]["price_book_status"]
          valid_from?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          status?: Database["public"]["Enums"]["price_book_status"]
          valid_from?: string
        }
        Relationships: []
      }
      rate_plans: {
        Row: {
          currency: string
          id: string
          min_hours: number
          price_book_id: string
          resource_id: string
          rounding_increment: number
          step_hours: number
          tax_mode: Database["public"]["Enums"]["tax_mode"]
        }
        Insert: {
          currency?: string
          id?: string
          min_hours?: number
          price_book_id: string
          resource_id: string
          rounding_increment?: number
          step_hours?: number
          tax_mode?: Database["public"]["Enums"]["tax_mode"]
        }
        Update: {
          currency?: string
          id?: string
          min_hours?: number
          price_book_id?: string
          resource_id?: string
          rounding_increment?: number
          step_hours?: number
          tax_mode?: Database["public"]["Enums"]["tax_mode"]
        }
        Relationships: [
          {
            foreignKeyName: "rate_plans_price_book_id_fkey"
            columns: ["price_book_id"]
            isOneToOne: false
            referencedRelation: "price_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rate_plans_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_tiers: {
        Row: {
          amount_clp: number
          end_minute: number
          id: string
          key: string
          priority: number
          rate_plan_id: string
          start_minute: number
          weekdays: number[]
        }
        Insert: {
          amount_clp: number
          end_minute: number
          id?: string
          key: string
          priority?: number
          rate_plan_id: string
          start_minute: number
          weekdays: number[]
        }
        Update: {
          amount_clp?: number
          end_minute?: number
          id?: string
          key?: string
          priority?: number
          rate_plan_id?: string
          start_minute?: number
          weekdays?: number[]
        }
        Relationships: [
          {
            foreignKeyName: "rate_tiers_rate_plan_id_fkey"
            columns: ["rate_plan_id"]
            isOneToOne: false
            referencedRelation: "rate_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      reservations: {
        Row: {
          created_at: string
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          ends_at: string
          expires_at: string | null
          id: string
          kind: string
          notes: string | null
          order_id: string | null
          resource_id: string
          starts_at: string
          status: Database["public"]["Enums"]["reservation_status"]
        }
        Insert: {
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          ends_at: string
          expires_at?: string | null
          id?: string
          kind?: string
          notes?: string | null
          order_id?: string | null
          resource_id: string
          starts_at: string
          status?: Database["public"]["Enums"]["reservation_status"]
        }
        Update: {
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          ends_at?: string
          expires_at?: string | null
          id?: string
          kind?: string
          notes?: string | null
          order_id?: string | null
          resource_id?: string
          starts_at?: string
          status?: Database["public"]["Enums"]["reservation_status"]
        }
        Relationships: [
          {
            foreignKeyName: "reservations_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id"]
          },
        ]
      }
      resources: {
        Row: {
          active: boolean
          created_at: string
          id: string
          kind: string
          location_id: string
          name: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          kind?: string
          location_id: string
          name: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          kind?: string
          location_id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "resources_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_exceptions: {
        Row: {
          close_minute: number | null
          closed: boolean
          created_at: string
          date: string
          id: string
          open_minute: number | null
          reason: string | null
          resource_id: string
        }
        Insert: {
          close_minute?: number | null
          closed?: boolean
          created_at?: string
          date: string
          id?: string
          open_minute?: number | null
          reason?: string | null
          resource_id: string
        }
        Update: {
          close_minute?: number | null
          closed?: boolean
          created_at?: string
          date?: string
          id?: string
          open_minute?: number | null
          reason?: string | null
          resource_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_exceptions_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_rates: {
        Row: {
          code: string
          id: string
          pct: number
        }
        Insert: {
          code: string
          id?: string
          pct: number
        }
        Update: {
          code?: string
          id?: string
          pct?: number
        }
        Relationships: []
      }
      volume_discounts: {
        Row: {
          id: string
          min_hours: number
          pct: number
          rate_plan_id: string
        }
        Insert: {
          id?: string
          min_hours: number
          pct: number
          rate_plan_id: string
        }
        Update: {
          id?: string
          min_hours?: number
          pct?: number
          rate_plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "volume_discounts_rate_plan_id_fkey"
            columns: ["rate_plan_id"]
            isOneToOne: false
            referencedRelation: "rate_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_events: {
        Row: {
          created_at: string
          event_id: string
          id: string
          payload: Json | null
          provider: string
          topic: string | null
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          payload?: Json | null
          provider?: string
          topic?: string | null
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          payload?: Json | null
          provider?: string
          topic?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cancel_unpaid_order: { Args: { p_order: string }; Returns: undefined }
      confirm_payment: {
        Args: { p_order: string; p_payment_id: string }
        Returns: undefined
      }
      create_checkout: {
        Args: {
          p_amount: number
          p_currency: string
          p_customer: Json
          p_ends: string
          p_lines: Json
          p_net: number
          p_resource: string
          p_snapshot: Json
          p_starts: string
          p_tax: number
          p_ttl?: string
        }
        Returns: string
      }
      create_hold: {
        Args: {
          p_ends: string
          p_resource: string
          p_starts: string
          p_ttl?: string
        }
        Returns: string
      }
      expire_stale_holds: { Args: { p_resource?: string }; Returns: number }
    }
    Enums: {
      order_status:
        | "cart"
        | "pending_payment"
        | "paid"
        | "fulfilled"
        | "cancelled"
        | "refunded"
      price_book_status: "draft" | "active" | "archived"
      reservation_status: "held" | "confirmed" | "cancelled" | "expired"
      tax_mode: "inclusive" | "exclusive"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      order_status: [
        "cart",
        "pending_payment",
        "paid",
        "fulfilled",
        "cancelled",
        "refunded",
      ],
      price_book_status: ["draft", "active", "archived"],
      reservation_status: ["held", "confirmed", "cancelled", "expired"],
      tax_mode: ["inclusive", "exclusive"],
    },
  },
} as const


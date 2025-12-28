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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          created_at: string | null
          id: string
          new_data: Json | null
          old_data: Json | null
          record_id: string | null
          table_name: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name?: string
          user_id?: string | null
        }
        Relationships: []
      }
      complaints: {
        Row: {
          created_at: string | null
          customer_name: string | null
          customer_phone: string | null
          id: string
          message: string
          order_id: string | null
          order_number: number | null
          responded_at: string | null
          responded_by: string | null
          response: string | null
          status: string | null
          table_number: string | null
          type: string
          urgency: string | null
        }
        Insert: {
          created_at?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          id?: string
          message: string
          order_id?: string | null
          order_number?: number | null
          responded_at?: string | null
          responded_by?: string | null
          response?: string | null
          status?: string | null
          table_number?: string | null
          type?: string
          urgency?: string | null
        }
        Update: {
          created_at?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          id?: string
          message?: string
          order_id?: string | null
          order_number?: number | null
          responded_at?: string | null
          responded_by?: string | null
          response?: string | null
          status?: string | null
          table_number?: string | null
          type?: string
          urgency?: string | null
        }
        Relationships: []
      }
      customer_questions: {
        Row: {
          answer: string | null
          answered_at: string | null
          answered_by: string | null
          category: string | null
          created_at: string | null
          customer_name: string | null
          customer_phone: string | null
          id: string
          order_id: string | null
          question: string
          status: string | null
          table_number: string | null
        }
        Insert: {
          answer?: string | null
          answered_at?: string | null
          answered_by?: string | null
          category?: string | null
          created_at?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          id?: string
          order_id?: string | null
          question: string
          status?: string | null
          table_number?: string | null
        }
        Update: {
          answer?: string | null
          answered_at?: string | null
          answered_by?: string | null
          category?: string | null
          created_at?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          id?: string
          order_id?: string | null
          question?: string
          status?: string | null
          table_number?: string | null
        }
        Relationships: []
      }
      financial_entries: {
        Row: {
          amount: number
          category: string
          created_at: string | null
          created_by: string | null
          description: string | null
          entry_date: string
          entry_type: string
          id: string
          reference_id: string | null
          reference_type: string | null
        }
        Insert: {
          amount: number
          category: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          entry_date?: string
          entry_type: string
          id?: string
          reference_id?: string | null
          reference_type?: string | null
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          entry_date?: string
          entry_type?: string
          id?: string
          reference_id?: string | null
          reference_type?: string | null
        }
        Relationships: []
      }
      menu_items: {
        Row: {
          category: string
          created_at: string | null
          display_order: number | null
          id: string
          is_available: boolean | null
          recipe_id: string
          sell_price: number
          updated_at: string | null
        }
        Insert: {
          category: string
          created_at?: string | null
          display_order?: number | null
          id?: string
          is_available?: boolean | null
          recipe_id: string
          sell_price: number
          updated_at?: string | null
        }
        Update: {
          category?: string
          created_at?: string | null
          display_order?: number | null
          id?: string
          is_available?: boolean | null
          recipe_id?: string
          sell_price?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: true
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string | null
          data: Json | null
          id: string
          is_read: boolean | null
          message: string | null
          priority: string | null
          read_at: string | null
          target_roles: string[] | null
          target_user_id: string | null
          title: string
          type: string
        }
        Insert: {
          created_at?: string | null
          data?: Json | null
          id?: string
          is_read?: boolean | null
          message?: string | null
          priority?: string | null
          read_at?: string | null
          target_roles?: string[] | null
          target_user_id?: string | null
          title: string
          type: string
        }
        Update: {
          created_at?: string | null
          data?: Json | null
          id?: string
          is_read?: boolean | null
          message?: string | null
          priority?: string | null
          read_at?: string | null
          target_roles?: string[] | null
          target_user_id?: string | null
          title?: string
          type?: string
        }
        Relationships: []
      }
      order_items: {
        Row: {
          created_at: string | null
          id: string
          menu_item_id: string
          notes: string | null
          order_id: string
          quantity: number
          status: string | null
          total_price: number
          unit_price: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          menu_item_id: string
          notes?: string | null
          order_id: string
          quantity?: number
          status?: string | null
          total_price: number
          unit_price: number
        }
        Update: {
          created_at?: string | null
          id?: string
          menu_item_id?: string
          notes?: string | null
          order_id?: string
          quantity?: number
          status?: string | null
          total_price?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          confirmed_at: string | null
          created_at: string | null
          customer_name: string | null
          customer_phone: string | null
          delivered_at: string | null
          discount: number | null
          id: string
          notes: string | null
          order_number: number
          order_type: string
          paid_at: string | null
          payment_method: string | null
          preparing_at: string | null
          ready_at: string | null
          rejection_reason: string | null
          status: string
          subtotal: number | null
          table_number: string | null
          total: number | null
          updated_at: string | null
          waiter_id: string | null
        }
        Insert: {
          confirmed_at?: string | null
          created_at?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          delivered_at?: string | null
          discount?: number | null
          id?: string
          notes?: string | null
          order_number?: number
          order_type?: string
          paid_at?: string | null
          payment_method?: string | null
          preparing_at?: string | null
          ready_at?: string | null
          rejection_reason?: string | null
          status?: string
          subtotal?: number | null
          table_number?: string | null
          total?: number | null
          updated_at?: string | null
          waiter_id?: string | null
        }
        Update: {
          confirmed_at?: string | null
          created_at?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          delivered_at?: string | null
          discount?: number | null
          id?: string
          notes?: string | null
          order_number?: number
          order_type?: string
          paid_at?: string | null
          payment_method?: string | null
          preparing_at?: string | null
          ready_at?: string | null
          rejection_reason?: string | null
          status?: string
          subtotal?: number | null
          table_number?: string | null
          total?: number | null
          updated_at?: string | null
          waiter_id?: string | null
        }
        Relationships: []
      }
      products: {
        Row: {
          average_price: number | null
          created_at: string | null
          current_quantity: number | null
          default_supplier_id: string | null
          id: string
          is_active: boolean | null
          last_price: number | null
          min_quantity: number | null
          name: string
          unit: string
          updated_at: string | null
        }
        Insert: {
          average_price?: number | null
          created_at?: string | null
          current_quantity?: number | null
          default_supplier_id?: string | null
          id?: string
          is_active?: boolean | null
          last_price?: number | null
          min_quantity?: number | null
          name: string
          unit: string
          updated_at?: string | null
        }
        Update: {
          average_price?: number | null
          created_at?: string | null
          current_quantity?: number | null
          default_supplier_id?: string | null
          id?: string
          is_active?: boolean | null
          last_price?: number | null
          min_quantity?: number | null
          name?: string
          unit?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_default_supplier_id_fkey"
            columns: ["default_supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          full_name: string
          id: string
          phone: string | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          full_name: string
          id: string
          phone?: string | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      purchase_history: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          notes: string | null
          product_id: string
          purchase_date: string
          quantity: number
          supplier_id: string | null
          total_price: number
          unit_price: number | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          notes?: string | null
          product_id: string
          purchase_date: string
          quantity: number
          supplier_id?: string | null
          total_price: number
          unit_price?: number | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          notes?: string | null
          product_id?: string
          purchase_date?: string
          quantity?: number
          supplier_id?: string | null
          total_price?: number
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_history_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_history_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      ratings: {
        Row: {
          ambiance_rating: number | null
          comment: string | null
          created_at: string | null
          customer_name: string | null
          customer_phone: string | null
          food_rating: number | null
          id: string
          order_id: string | null
          order_number: number | null
          overall_rating: number
          service_rating: number | null
        }
        Insert: {
          ambiance_rating?: number | null
          comment?: string | null
          created_at?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          food_rating?: number | null
          id?: string
          order_id?: string | null
          order_number?: number | null
          overall_rating: number
          service_rating?: number | null
        }
        Update: {
          ambiance_rating?: number | null
          comment?: string | null
          created_at?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          food_rating?: number | null
          id?: string
          order_id?: string | null
          order_number?: number | null
          overall_rating?: number
          service_rating?: number | null
        }
        Relationships: []
      }
      recipe_items: {
        Row: {
          created_at: string | null
          id: string
          product_id: string | null
          quantity: number
          recipe_id: string
          subrecipe_id: string | null
          unit: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          product_id?: string | null
          quantity: number
          recipe_id: string
          subrecipe_id?: string | null
          unit: string
        }
        Update: {
          created_at?: string | null
          id?: string
          product_id?: string | null
          quantity?: number
          recipe_id?: string
          subrecipe_id?: string | null
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_items_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_items_subrecipe_id_fkey"
            columns: ["subrecipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipes: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          image_url: string | null
          instructions: string | null
          is_available: boolean | null
          name: string
          preparation_time: number | null
          recipe_type: string
          updated_at: string | null
          yield_quantity: number
          yield_unit: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          instructions?: string | null
          is_available?: boolean | null
          name: string
          preparation_time?: number | null
          recipe_type?: string
          updated_at?: string | null
          yield_quantity?: number
          yield_unit?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          instructions?: string | null
          is_available?: boolean | null
          name?: string
          preparation_time?: number | null
          recipe_type?: string
          updated_at?: string | null
          yield_quantity?: number
          yield_unit?: string | null
        }
        Relationships: []
      }
      reservations: {
        Row: {
          cancellation_reason: string | null
          cancelled_at: string | null
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string | null
          customer_email: string | null
          customer_name: string
          customer_phone: string
          duration_minutes: number | null
          id: string
          notes: string | null
          party_size: number
          reminder_sent_at: string | null
          reservation_date: string
          reservation_time: string
          status: string
          table_number: string
          updated_at: string | null
        }
        Insert: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string | null
          customer_email?: string | null
          customer_name: string
          customer_phone: string
          duration_minutes?: number | null
          id?: string
          notes?: string | null
          party_size?: number
          reminder_sent_at?: string | null
          reservation_date: string
          reservation_time: string
          status?: string
          table_number: string
          updated_at?: string | null
        }
        Update: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string | null
          customer_email?: string | null
          customer_name?: string
          customer_phone?: string
          duration_minutes?: number | null
          id?: string
          notes?: string | null
          party_size?: number
          reminder_sent_at?: string | null
          reservation_date?: string
          reservation_time?: string
          status?: string
          table_number?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      restaurant_settings: {
        Row: {
          accept_reservations: boolean | null
          address: string | null
          city: string | null
          cnpj: string | null
          created_at: string | null
          default_order_type: string | null
          description: string | null
          email: string | null
          id: string
          logo_url: string | null
          max_tables: number | null
          name: string
          operating_hours: Json | null
          phone: string | null
          primary_color: string | null
          reminder_hour: number | null
          reservation_webhook_url: string | null
          state: string | null
          updated_at: string | null
          zip_code: string | null
        }
        Insert: {
          accept_reservations?: boolean | null
          address?: string | null
          city?: string | null
          cnpj?: string | null
          created_at?: string | null
          default_order_type?: string | null
          description?: string | null
          email?: string | null
          id?: string
          logo_url?: string | null
          max_tables?: number | null
          name?: string
          operating_hours?: Json | null
          phone?: string | null
          primary_color?: string | null
          reminder_hour?: number | null
          reservation_webhook_url?: string | null
          state?: string | null
          updated_at?: string | null
          zip_code?: string | null
        }
        Update: {
          accept_reservations?: boolean | null
          address?: string | null
          city?: string | null
          cnpj?: string | null
          created_at?: string | null
          default_order_type?: string | null
          description?: string | null
          email?: string | null
          id?: string
          logo_url?: string | null
          max_tables?: number | null
          name?: string
          operating_hours?: Json | null
          phone?: string | null
          primary_color?: string | null
          reminder_hour?: number | null
          reservation_webhook_url?: string | null
          state?: string | null
          updated_at?: string | null
          zip_code?: string | null
        }
        Relationships: []
      }
      stock_movements: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          movement_type: string
          notes: string | null
          product_id: string
          quantity: number
          reference_id: string | null
          reference_type: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          movement_type: string
          notes?: string | null
          product_id: string
          quantity: number
          reference_id?: string | null
          reference_type?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          movement_type?: string
          notes?: string | null
          product_id?: string
          quantity?: number
          reference_id?: string | null
          reference_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      suggestions: {
        Row: {
          created_at: string | null
          customer_name: string | null
          customer_phone: string | null
          id: string
          message: string
          responded_at: string | null
          responded_by: string | null
          response: string | null
          status: string | null
          table_number: string | null
          type: string | null
        }
        Insert: {
          created_at?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          id?: string
          message: string
          responded_at?: string | null
          responded_by?: string | null
          response?: string | null
          status?: string | null
          table_number?: string | null
          type?: string | null
        }
        Update: {
          created_at?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          id?: string
          message?: string
          responded_at?: string | null
          responded_by?: string | null
          response?: string | null
          status?: string | null
          table_number?: string | null
          type?: string | null
        }
        Relationships: []
      }
      suppliers: {
        Row: {
          address: string | null
          contact_name: string | null
          created_at: string | null
          email: string | null
          id: string
          is_active: boolean | null
          name: string
          notes: string | null
          phone: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          contact_name?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          contact_name?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string | null
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
      get_user_roles: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"][]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role:
        | "admin"
        | "financeiro"
        | "estoque"
        | "cozinha"
        | "garcom"
        | "cliente"
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
      app_role: [
        "admin",
        "financeiro",
        "estoque",
        "cozinha",
        "garcom",
        "cliente",
      ],
    },
  },
} as const

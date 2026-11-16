
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "bookings": {
                  Row: {
                    "blocked_until": string,"business_id": string,"cancelled_at": string | null,"created_at": string,"customer_email": string,"customer_name": string,"customer_phone": string | null,"customer_timezone": string | null,"ends_at": string,"id": string,"manage_token_hash": string | null,"notes": string | null,"service_id": string,"staff_id": string,"starts_at": string,"status": Database["public"]['Enums']["booking_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "blocked_until": string,"business_id": string,"cancelled_at"?: string | null,"created_at"?: string,"customer_email": string,"customer_name": string,"customer_phone"?: string | null,"customer_timezone"?: string | null,"ends_at": string,"id"?: string,"manage_token_hash"?: string | null,"notes"?: string | null,"service_id": string,"staff_id": string,"starts_at": string,"status"?: Database["public"]['Enums']["booking_status"]
                  }
                  Update: {
                    "blocked_until"?: string,"business_id"?: string,"cancelled_at"?: string | null,"created_at"?: string,"customer_email"?: string,"customer_name"?: string,"customer_phone"?: string | null,"customer_timezone"?: string | null,"ends_at"?: string,"id"?: string,"manage_token_hash"?: string | null,"notes"?: string | null,"service_id"?: string,"staff_id"?: string,"starts_at"?: string,"status"?: Database["public"]['Enums']["booking_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "bookings_business_id_service_id_fkey"
      columns: ["business_id","service_id"]
isOneToOne: false
      referencedRelation: "services"
      referencedColumns: ["business_id","id"]
    },{
      foreignKeyName: "bookings_business_id_staff_id_fkey"
      columns: ["business_id","staff_id"]
isOneToOne: false
      referencedRelation: "staff"
      referencedColumns: ["business_id","id"]
    }
                  ]
                },"business_invitations": {
                  Row: {
                    "accepted_at": string | null,"accepted_by": string | null,"business_id": string,"created_at": string,"created_by": string | null,"expires_at": string,"id": string,"role": Database["public"]['Enums']["member_role"],"staff_id": string | null,"token_hash": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string | null,"accepted_by"?: string | null,"business_id": string,"created_at"?: string,"created_by"?: string | null,"expires_at"?: string,"id"?: string,"role": Database["public"]['Enums']["member_role"],"staff_id"?: string | null,"token_hash": string
                  }
                  Update: {
                    "accepted_at"?: string | null,"accepted_by"?: string | null,"business_id"?: string,"created_at"?: string,"created_by"?: string | null,"expires_at"?: string,"id"?: string,"role"?: Database["public"]['Enums']["member_role"],"staff_id"?: string | null,"token_hash"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "business_invitations_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "business_invitations_business_id_staff_id_fkey"
      columns: ["business_id","staff_id"]
isOneToOne: false
      referencedRelation: "staff"
      referencedColumns: ["business_id","id"]
    }
                  ]
                },"business_members": {
                  Row: {
                    "business_id": string,"created_at": string,"role": Database["public"]['Enums']["member_role"],"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "business_id": string,"created_at"?: string,"role": Database["public"]['Enums']["member_role"],"user_id": string
                  }
                  Update: {
                    "business_id"?: string,"created_at"?: string,"role"?: Database["public"]['Enums']["member_role"],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "business_members_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    }
                  ]
                },"businesses": {
                  Row: {
                    "booking_horizon_days": number,"cancellation_deadline_hours": number,"created_at": string,"created_by": string | null,"id": string,"is_demo": boolean,"min_notice_minutes": number,"name": string,"slot_step_minutes": number,"slug": string,"timezone": string
                  }
                  ComputedFields: never
                  Insert: {
                    "booking_horizon_days"?: number,"cancellation_deadline_hours"?: number,"created_at"?: string,"created_by"?: string | null,"id"?: string,"is_demo"?: boolean,"min_notice_minutes"?: number,"name": string,"slot_step_minutes"?: number,"slug": string,"timezone": string
                  }
                  Update: {
                    "booking_horizon_days"?: number,"cancellation_deadline_hours"?: number,"created_at"?: string,"created_by"?: string | null,"id"?: string,"is_demo"?: boolean,"min_notice_minutes"?: number,"name"?: string,"slot_step_minutes"?: number,"slug"?: string,"timezone"?: string
                  }
                  Relationships: [
                    
                  ]
                },"services": {
                  Row: {
                    "buffer_min": number,"business_id": string,"created_at": string,"currency": string,"description": string | null,"duration_min": number,"id": string,"is_active": boolean,"name": string,"price_cents": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "buffer_min"?: number,"business_id": string,"created_at"?: string,"currency"?: string,"description"?: string | null,"duration_min": number,"id"?: string,"is_active"?: boolean,"name": string,"price_cents"?: number | null
                  }
                  Update: {
                    "buffer_min"?: number,"business_id"?: string,"created_at"?: string,"currency"?: string,"description"?: string | null,"duration_min"?: number,"id"?: string,"is_active"?: boolean,"name"?: string,"price_cents"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "services_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    }
                  ]
                },"staff": {
                  Row: {
                    "business_id": string,"created_at": string,"display_name": string,"id": string,"is_active": boolean,"member_user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "business_id": string,"created_at"?: string,"display_name": string,"id"?: string,"is_active"?: boolean,"member_user_id"?: string | null
                  }
                  Update: {
                    "business_id"?: string,"created_at"?: string,"display_name"?: string,"id"?: string,"is_active"?: boolean,"member_user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "staff_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    }
                  ]
                },"staff_services": {
                  Row: {
                    "business_id": string,"service_id": string,"staff_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "business_id": string,"service_id": string,"staff_id": string
                  }
                  Update: {
                    "business_id"?: string,"service_id"?: string,"staff_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "staff_services_business_id_service_id_fkey"
      columns: ["business_id","service_id"]
isOneToOne: false
      referencedRelation: "services"
      referencedColumns: ["business_id","id"]
    },{
      foreignKeyName: "staff_services_business_id_staff_id_fkey"
      columns: ["business_id","staff_id"]
isOneToOne: false
      referencedRelation: "staff"
      referencedColumns: ["business_id","id"]
    }
                  ]
                },"time_off": {
                  Row: {
                    "business_id": string,"created_at": string,"id": string,"period": unknown,"reason": string | null,"staff_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "business_id": string,"created_at"?: string,"id"?: string,"period": unknown,"reason"?: string | null,"staff_id": string
                  }
                  Update: {
                    "business_id"?: string,"created_at"?: string,"id"?: string,"period"?: unknown,"reason"?: string | null,"staff_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "time_off_business_id_staff_id_fkey"
      columns: ["business_id","staff_id"]
isOneToOne: false
      referencedRelation: "staff"
      referencedColumns: ["business_id","id"]
    }
                  ]
                },"weekly_hours": {
                  Row: {
                    "business_id": string,"end_time": string,"id": string,"staff_id": string,"start_time": string,"weekday": number
                  }
                  ComputedFields: never
                  Insert: {
                    "business_id": string,"end_time": string,"id"?: string,"staff_id": string,"start_time": string,"weekday": number
                  }
                  Update: {
                    "business_id"?: string,"end_time"?: string,"id"?: string,"staff_id"?: string,"start_time"?: string,"weekday"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "weekly_hours_business_id_staff_id_fkey"
      columns: ["business_id","staff_id"]
isOneToOne: false
      referencedRelation: "staff"
      referencedColumns: ["business_id","id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "accept_business_invitation":
{ Args: { "p_display_name"?: string,"p_token": string }; Returns: {
              "business_id": string,"role": Database["public"]['Enums']["member_role"]
            }[]
                           },
"available_slots":
{ Args: { "p_business_id": string,"p_from"?: string,"p_service_id": string,"p_staff_id"?: string,"p_to"?: string }; Returns: {
              "staff_id": string,"starts_at": string
            }[]
                           },
"complete_onboarding":
{ Args: { "p_buffer_min"?: number,"p_business_id": string,"p_duration_min": number,"p_end_time"?: string,"p_price_cents"?: number,"p_service_name": string,"p_staff_name": string,"p_start_time"?: string,"p_weekdays"?: (number)[] }; Returns: {
              "service_id": string,"staff_id": string
            }[]
                           },
"create_booking":
{ Args: { "p_business_id": string,"p_customer_email": string,"p_customer_name": string,"p_customer_phone"?: string,"p_customer_timezone"?: string,"p_notes"?: string,"p_service_id": string,"p_staff_id": string,"p_starts_at": string }; Returns: {
              "booking_id": string,"ends_at": string,"manage_token": string,"staff_id": string,"starts_at": string
            }[]
                           },
"create_business":
{ Args: { "p_name": string,"p_slug": string,"p_timezone": string }; Returns: string
                           },
"create_business_invitation":
{ Args: { "p_business_id": string,"p_role": Database["public"]['Enums']["member_role"],"p_staff_id"?: string }; Returns: {
              "expires_at": string,"invitation_id": string,"token": string
            }[]
                           },
"get_business_invitation":
{ Args: { "p_token": string }; Returns: {
              "business_id": string,"business_name": string,"business_slug": string,"expires_at": string,"invitation_id": string,"is_valid": boolean,"role": Database["public"]['Enums']["member_role"],"staff_id": string,"staff_name": string
            }[]
                           },
"set_staff_weekly_hours":
{ Args: { "p_business_id": string,"p_hours": Json,"p_staff_id": string }; Returns: undefined
                           }
          }
          Enums: {
            "booking_status": "confirmed"|"completed"|"no_show"|"cancelled","member_role": "staff"|"manager"|"owner"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "booking_status": ["confirmed", "completed", "no_show", "cancelled"],"member_role": ["staff", "manager", "owner"]
          }
        }
} as const

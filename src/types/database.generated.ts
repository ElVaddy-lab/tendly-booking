
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "bookings": {
                  Row: {
                    "blocked_until": string,"business_id": string,"cancelled_at": string | null,"created_at": string,"customer_email": string,"customer_name": string,"customer_phone": string | null,"customer_timezone": string | null,"ends_at": string,"erased_at": string | null,"id": string,"manage_token_hash": string | null,"notes": string | null,"service_id": string,"staff_id": string,"starts_at": string,"status": Database["public"]['Enums']["booking_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "blocked_until": string,"business_id": string,"cancelled_at"?: string | null,"created_at"?: string,"customer_email": string,"customer_name": string,"customer_phone"?: string | null,"customer_timezone"?: string | null,"ends_at": string,"erased_at"?: string | null,"id"?: string,"manage_token_hash"?: string | null,"notes"?: string | null,"service_id": string,"staff_id": string,"starts_at": string,"status"?: Database["public"]['Enums']["booking_status"]
                  }
                  Update: {
                    "blocked_until"?: string,"business_id"?: string,"cancelled_at"?: string | null,"created_at"?: string,"customer_email"?: string,"customer_name"?: string,"customer_phone"?: string | null,"customer_timezone"?: string | null,"ends_at"?: string,"erased_at"?: string | null,"id"?: string,"manage_token_hash"?: string | null,"notes"?: string | null,"service_id"?: string,"staff_id"?: string,"starts_at"?: string,"status"?: Database["public"]['Enums']["booking_status"]
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
                },"business_subscriptions": {
                  Row: {
                    "business_id": string,"cancel_at_period_end": boolean,"created_at": string,"current_period_end": string | null,"current_period_start": string | null,"plan_tier": Database["public"]['Enums']["plan_tier"],"status": Database["public"]['Enums']["subscription_status"],"stripe_customer_id": string | null,"stripe_price_id": string | null,"stripe_subscription_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "business_id": string,"cancel_at_period_end"?: boolean,"created_at"?: string,"current_period_end"?: string | null,"current_period_start"?: string | null,"plan_tier"?: Database["public"]['Enums']["plan_tier"],"status"?: Database["public"]['Enums']["subscription_status"],"stripe_customer_id"?: string | null,"stripe_price_id"?: string | null,"stripe_subscription_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "business_id"?: string,"cancel_at_period_end"?: boolean,"created_at"?: string,"current_period_end"?: string | null,"current_period_start"?: string | null,"plan_tier"?: Database["public"]['Enums']["plan_tier"],"status"?: Database["public"]['Enums']["subscription_status"],"stripe_customer_id"?: string | null,"stripe_price_id"?: string | null,"stripe_subscription_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "business_subscriptions_business_id_fkey"
      columns: ["business_id"]
isOneToOne: true
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
                },"notification_outbox": {
                  Row: {
                    "attempt_count": number,"booking_id": string | null,"business_id": string,"created_at": string,"dedupe_key": string | null,"event_type": Database["public"]['Enums']["notification_event_type"],"id": string,"last_error": string | null,"message_text": string,"scheduled_for": string,"sent_at": string | null,"staff_id": string,"status": Database["public"]['Enums']["notification_status"],"telegram_chat_id": number
                  }
                  ComputedFields: never
                  Insert: {
                    "attempt_count"?: number,"booking_id"?: string | null,"business_id": string,"created_at"?: string,"dedupe_key"?: string | null,"event_type": Database["public"]['Enums']["notification_event_type"],"id"?: string,"last_error"?: string | null,"message_text": string,"scheduled_for"?: string,"sent_at"?: string | null,"staff_id": string,"status"?: Database["public"]['Enums']["notification_status"],"telegram_chat_id": number
                  }
                  Update: {
                    "attempt_count"?: number,"booking_id"?: string | null,"business_id"?: string,"created_at"?: string,"dedupe_key"?: string | null,"event_type"?: Database["public"]['Enums']["notification_event_type"],"id"?: string,"last_error"?: string | null,"message_text"?: string,"scheduled_for"?: string,"sent_at"?: string | null,"staff_id"?: string,"status"?: Database["public"]['Enums']["notification_status"],"telegram_chat_id"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "notification_outbox_booking_id_fkey"
      columns: ["booking_id"]
isOneToOne: false
      referencedRelation: "bookings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notification_outbox_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notification_outbox_staff_id_fkey"
      columns: ["staff_id"]
isOneToOne: false
      referencedRelation: "staff"
      referencedColumns: ["id"]
    }
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
                    "business_id": string,"created_at": string,"display_name": string,"ics_enabled_at": string | null,"ics_token_hash": string | null,"id": string,"is_active": boolean,"member_user_id": string | null,"telegram_chat_id": number | null,"telegram_link_code_hash": string | null,"telegram_link_expires_at": string | null,"telegram_linked_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "business_id": string,"created_at"?: string,"display_name": string,"ics_enabled_at"?: string | null,"ics_token_hash"?: string | null,"id"?: string,"is_active"?: boolean,"member_user_id"?: string | null,"telegram_chat_id"?: number | null,"telegram_link_code_hash"?: string | null,"telegram_link_expires_at"?: string | null,"telegram_linked_at"?: string | null
                  }
                  Update: {
                    "business_id"?: string,"created_at"?: string,"display_name"?: string,"ics_enabled_at"?: string | null,"ics_token_hash"?: string | null,"id"?: string,"is_active"?: boolean,"member_user_id"?: string | null,"telegram_chat_id"?: number | null,"telegram_link_code_hash"?: string | null,"telegram_link_expires_at"?: string | null,"telegram_linked_at"?: string | null
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
                },"stripe_events": {
                  Row: {
                    "business_id": string | null,"event_type": string,"id": string,"processed_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "business_id"?: string | null,"event_type": string,"id": string,"processed_at"?: string
                  }
                  Update: {
                    "business_id"?: string | null,"event_type"?: string,"id"?: string,"processed_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "stripe_events_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
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
"available_slots_for_reschedule":
{ Args: { "p_from"?: string,"p_staff_id"?: string,"p_to"?: string,"p_token": string }; Returns: {
              "staff_id": string,"starts_at": string
            }[]
                           },
"cancel_booking":
{ Args: { "p_token": string }; Returns: {
              "booking_id": string,"cancelled_at": string,"status": Database["public"]['Enums']["booking_status"]
            }[]
                           },
"complete_onboarding":
{ Args: { "p_buffer_min"?: number,"p_business_id": string,"p_duration_min": number,"p_end_time"?: string,"p_price_cents"?: number,"p_service_name": string,"p_staff_name": string,"p_start_time"?: string,"p_weekdays"?: (number)[] }; Returns: {
              "service_id": string,"staff_id": string
            }[]
                           },
"complete_telegram_link":
{ Args: { "p_link_code": string,"p_telegram_chat_id": number }; Returns: {
              "business_id": string,"staff_id": string,"staff_name": string
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
"create_manual_booking":
{ Args: { "p_business_id": string,"p_customer_email"?: string,"p_customer_name": string,"p_customer_phone"?: string,"p_notes"?: string,"p_service_id": string,"p_staff_id": string,"p_starts_at": string }; Returns: {
              "booking_id": string,"ends_at": string,"manage_token": string,"staff_id": string,"starts_at": string
            }[]
                           },
"create_telegram_link_code":
{ Args: { "p_business_id": string,"p_staff_id": string }; Returns: {
              "expires_at": string,"link_code": string
            }[]
                           },
"enqueue_daily_staff_reminders":
{ Args: { "p_now"?: string }; Returns: number
                           },
"erase_booking_customer_data":
{ Args: { "p_booking_id": string,"p_business_id": string }; Returns: {
              "booking_id": string,"erased_at": string,"status": Database["public"]['Enums']["booking_status"]
            }[]
                           },
"get_booking_by_token":
{ Args: { "p_token": string }; Returns: {
              "booking_horizon_days": number,"booking_id": string,"business_id": string,"business_is_demo": boolean,"business_name": string,"business_slug": string,"business_timezone": string,"can_cancel": boolean,"can_reschedule": boolean,"cancellation_deadline_hours": number,"cancelled_at": string,"created_at": string,"customer_name": string,"customer_timezone": string,"deadline_at": string,"ends_at": string,"min_notice_minutes": number,"notes": string,"service_buffer_min": number,"service_currency": string,"service_duration_min": number,"service_id": string,"service_is_active": boolean,"service_name": string,"service_price_cents": number,"slot_step_minutes": number,"staff_id": string,"staff_name": string,"starts_at": string,"status": Database["public"]['Enums']["booking_status"],"token_expires_at": string
            }[]
                           },
"get_business_invitation":
{ Args: { "p_token": string }; Returns: {
              "business_id": string,"business_name": string,"business_slug": string,"expires_at": string,"invitation_id": string,"is_valid": boolean,"role": Database["public"]['Enums']["member_role"],"staff_id": string,"staff_name": string
            }[]
                           },
"get_business_plan_usage":
{ Args: { "p_business_id": string }; Returns: {
              "active_services_count": number,"active_staff_count": number,"cancel_at_period_end": boolean,"current_period_end": string,"has_stripe_customer": boolean,"max_monthly_bookings": number,"max_services": number,"max_staff": number,"monthly_bookings_count": number,"plan_tier": Database["public"]['Enums']["plan_tier"],"subscription_status": Database["public"]['Enums']["subscription_status"]
            }[]
                           },
"get_staff_calendar_feed":
{ Args: { "p_token": string }; Returns: {
              "booking_id": string,"business_name": string,"business_slug": string,"business_timezone": string,"customer_name": string,"ends_at": string,"notes": string,"service_name": string,"staff_name": string,"starts_at": string,"status": Database["public"]['Enums']["booking_status"]
            }[]
                           },
"reschedule_booking":
{ Args: { "p_staff_id": string,"p_starts_at": string,"p_token": string }; Returns: {
              "booking_id": string,"ends_at": string,"staff_id": string,"starts_at": string
            }[]
                           },
"revoke_staff_ics_token":
{ Args: { "p_business_id": string,"p_staff_id": string }; Returns: undefined
                           },
"rotate_staff_ics_token":
{ Args: { "p_business_id": string,"p_staff_id": string }; Returns: {
              "enabled_at": string,"ics_token": string
            }[]
                           },
"set_staff_weekly_hours":
{ Args: { "p_business_id": string,"p_hours": Json,"p_staff_id": string }; Returns: undefined
                           },
"unlink_staff_telegram":
{ Args: { "p_business_id": string,"p_staff_id": string }; Returns: undefined
                           },
"update_booking_status":
{ Args: { "p_booking_id": string,"p_business_id": string,"p_status": Database["public"]['Enums']["booking_status"] }; Returns: {
              "booking_id": string,"cancelled_at": string,"status": Database["public"]['Enums']["booking_status"]
            }[]
                           }
          }
          Enums: {
            "booking_status": "confirmed"|"completed"|"no_show"|"cancelled","member_role": "staff"|"manager"|"owner","notification_event_type": "booking_created"|"booking_cancelled"|"booking_rescheduled"|"daily_digest","notification_status": "pending"|"sent"|"failed","plan_tier": "free"|"pro","subscription_status": "incomplete"|"incomplete_expired"|"trialing"|"active"|"past_due"|"canceled"|"unpaid"|"paused"
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
            "booking_status": ["confirmed", "completed", "no_show", "cancelled"],"member_role": ["staff", "manager", "owner"],"notification_event_type": ["booking_created", "booking_cancelled", "booking_rescheduled", "daily_digest"],"notification_status": ["pending", "sent", "failed"],"plan_tier": ["free", "pro"],"subscription_status": ["incomplete", "incomplete_expired", "trialing", "active", "past_due", "canceled", "unpaid", "paused"]
          }
        }
} as const

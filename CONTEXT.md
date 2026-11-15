# Tendly — domain language

Use these words in code, database names, UI copy and docs. One concept, one word.

| Term | Meaning | In the database |
|---|---|---|
| **Business** | A tenant: one barbershop, salon or studio with its own public page `/b/[slug]`, IANA time zone and settings. Every other record belongs to exactly one Business. | `businesses` |
| **Member** | A signed-in user who belongs to a Business with a **Role**. | `business_members` |
| **Role** | `owner` (billing, settings) ≥ `manager` (schedule, services, all bookings) ≥ `staff` (own schedule and own bookings). | `business_members.role` |
| **Staff** | A person customers can book. Usually linked to a Member, but may exist without an account. Not the same as the `staff` Role. | `staff` |
| **Service** | Something a customer books: name, duration, buffer after, display price. Offered by specific Staff. | `services`, `staff_services` |
| **Weekly hours** | Recurring working hours of a Staff per weekday, in the Business's local time. | `weekly_hours` |
| **Time off** | An exception that removes availability for a period (vacation, sick day, changed hours). | `time_off` |
| **Slot** | A start time a customer can book for a Service with a Staff. Computed by Postgres, never stored. | `available_slots()` |
| **Booking** | A confirmed appointment: Staff, Service, `starts_at`/`ends_at` in UTC, plus `blocked_until` (end + buffer). Status: `confirmed` → `completed` / `no_show` / `cancelled`. | `bookings` |
| **Customer** | The person who made a Booking. Has no account; identified only by the details on the Booking. | columns on `bookings` |
| **Manage link** | A secret link that lets the Customer cancel or reschedule before the deadline. Only its hash is stored. | `bookings.manage_token_hash` |
| **Plan** | `free` or `pro`. Limits are enforced by the database; state comes only from Stripe webhooks. | `business_subscriptions` |
| **Demo business** | The fictional barbershop shown in the portfolio, reset nightly. Always labelled “Demo business — fictional”. | flag on `businesses` |
| **Visitor account** | An account a site visitor created through open sign-up; deleted with its Business after 24 hours. | — |

## Rules of thumb

- Time is stored as `timestamptz` (UTC). Weekly hours are local `time` + weekday, interpreted in the Business time zone. Customers see times in their own zone.
- Double booking is impossible at the database level: an exclusion constraint on `(staff_id, [starts_at, blocked_until))` for confirmed Bookings.
- There are no holds in the MVP: a Booking is created atomically by `create_booking()`.

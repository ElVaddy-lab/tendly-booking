import { processStripeWebhookEvent } from "@/lib/stripe-billing";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signatureHeader = request.headers.get("stripe-signature");
  const adminSupabase = createAdminSupabaseClient();

  const result = await processStripeWebhookEvent({
    rawBody,
    signatureHeader,
    adminSupabase,
  });

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status });
  }

  return Response.json(
    {
      received: true,
      ...(result.duplicate ? { duplicate: true } : {}),
      ...(result.ignored ? { ignored: result.ignored } : {}),
      ...(result.businessId ? { businessId: result.businessId } : {}),
      ...(result.planTier ? { planTier: result.planTier } : {}),
      ...(result.subscriptionStatus
        ? { subscriptionStatus: result.subscriptionStatus }
        : {}),
    },
    { status: 200 },
  );
}

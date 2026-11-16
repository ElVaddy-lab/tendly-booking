import { resetDemoAndCancelSubscriptions } from "@/lib/demo-mode";
import { verifyCronSecret } from "@/lib/notifications";

async function handleDemoReset(request: Request) {
  const authResult = verifyCronSecret(request);
  if (!authResult.ok) {
    return Response.json(
      { error: authResult.error },
      { status: authResult.status },
    );
  }

  const result = await resetDemoAndCancelSubscriptions();
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 500 });
  }

  return Response.json(result, { status: 200 });
}

export async function GET(request: Request) {
  return handleDemoReset(request);
}

export async function POST(request: Request) {
  return handleDemoReset(request);
}

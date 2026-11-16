import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import Stripe from "stripe";

const PRODUCT_NAME = "Tendly Pro";
const PRO_UNIT_AMOUNT_CENTS = 1900;
const PRO_CURRENCY = "usd";
const PRO_LOOKUP_KEY = "tendly_pro_monthly";

function loadEnvLocalIfMissing() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) {
    return;
  }
  const contents = readFileSync(envPath, "utf8");
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const eqIndex = line.indexOf("=");
    if (eqIndex <= 0) {
      continue;
    }
    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]?.trim() && value) {
      process.env[key] = value;
    }
  }
}

async function main() {
  loadEnvLocalIfMissing();

  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) {
    console.error(
      "Missing STRIPE_SECRET_KEY. Add your Stripe sandbox key (sk_test_...) to .env.local or environment variables, then re-run `pnpm stripe:setup`.",
    );
    process.exit(1);
  }

  const stripe = new Stripe(secretKey);

  const products = await stripe.products.list({ active: true, limit: 100 });
  let product = products.data.find(
    (item) => item.metadata?.tendly_plan === "pro" || item.name === PRODUCT_NAME,
  );

  if (!product) {
    product = await stripe.products.create({
      name: PRODUCT_NAME,
      description:
        "Tendly Pro plan: up to 10 staff members, unlimited services & bookings, Telegram & .ics calendar sync.",
      metadata: { tendly_plan: "pro" },
    });
    console.log(`Created Stripe product: ${product.id} (${product.name})`);
  } else {
    console.log(`Reusing Stripe product: ${product.id} (${product.name})`);
  }

  const prices = await stripe.prices.list({
    product: product.id,
    active: true,
    type: "recurring",
    limit: 100,
  });

  let price = prices.data.find(
    (item) =>
      item.currency === PRO_CURRENCY &&
      item.unit_amount === PRO_UNIT_AMOUNT_CENTS &&
      item.recurring?.interval === "month",
  );

  if (!price) {
    price = await stripe.prices.create({
      product: product.id,
      currency: PRO_CURRENCY,
      unit_amount: PRO_UNIT_AMOUNT_CENTS,
      recurring: { interval: "month" },
      lookup_key: PRO_LOOKUP_KEY,
      metadata: { tendly_plan: "pro" },
    });
    console.log(`Created Stripe recurring price ($19/month): ${price.id}`);
  } else {
    console.log(`Reusing Stripe recurring price ($19/month): ${price.id}`);
  }

  console.log("");
  console.log("Add this line to .env.local:");
  console.log(`STRIPE_PRO_PRICE_ID=${price.id}`);
}

main().catch((error) => {
  console.error("Failed to provision Stripe sandbox product/price:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});

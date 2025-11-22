import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { Stripe } from "stripe";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { STRIPE_PLANS } from "@/lib/constants/stripe";

// Lazy initialization to avoid build-time errors
function getStripe() {
  const apiKey = process.env.STRIPE_SECRET_KEY;
  if (!apiKey) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  return new Stripe(apiKey);
}

function getWebhookSecret() {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not configured");
  }
  return secret;
}

export async function POST(request: Request) {
  try {
    // Check if Stripe is configured
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    
    if (!stripeSecretKey || !webhookSecret) {
      return NextResponse.json(
        { error: "Stripe is not configured" },
        { status: 503 }
      );
    }

    const stripe = getStripe();
    const body = await request.text();
    const signature = headers().get("stripe-signature")!;

    // Verify the webhook signature
    const event = stripe.webhooks.constructEvent(
      body,
      signature,
      webhookSecret
    );

    // Handle checkout session completion
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;

      // Get the price ID from the session
      const lineItems = await stripe.checkout.sessions.listLineItems(
        session.id
      );
      const priceId = lineItems.data[0].price?.id;

      // Determine the plan based on price ID
      let plan: "lite" | "pro" | "business";

      // Get all possible price IDs for each plan
      const priceIdToPlan = {
        [STRIPE_PLANS.lite.monthlyPriceId.dev]: "lite",
        [STRIPE_PLANS.lite.monthlyPriceId.prod]: "lite",
        [STRIPE_PLANS.lite.yearlyPriceId.dev]: "lite",
        [STRIPE_PLANS.lite.yearlyPriceId.prod]: "lite",
        [STRIPE_PLANS.pro.monthlyPriceId.dev]: "pro",
        [STRIPE_PLANS.pro.monthlyPriceId.prod]: "pro",
        [STRIPE_PLANS.pro.yearlyPriceId.dev]: "pro",
        [STRIPE_PLANS.pro.yearlyPriceId.prod]: "pro",
        [STRIPE_PLANS.business.monthlyPriceId.dev]: "business",
        [STRIPE_PLANS.business.monthlyPriceId.prod]: "business",
        [STRIPE_PLANS.business.yearlyPriceId.dev]: "business",
        [STRIPE_PLANS.business.yearlyPriceId.prod]: "business",
      } as const;

      plan = priceIdToPlan[priceId as keyof typeof priceIdToPlan];

      if (!plan) {
        console.error(`Invalid price ID: ${priceId}`);
        throw new Error(`Invalid price ID: ${priceId}`);
      }

      const customerEmail = session.customer_email;
      if (!customerEmail) {
        throw new Error("No customer email found in session");
      }

      await db
        .update(users)
        .set({
          plan,
          stripeCustomerId: session.customer as string,
        })
        .where(eq(users.email, customerEmail));
    }

    // Handle subscription updates
    if (event.type === "customer.subscription.updated") {
      const subscription = event.data.object as Stripe.Subscription;
      const priceId = subscription.items.data[0].price.id;

      // Determine the new plan based on price ID
      let plan: "lite" | "pro" | "business";

      // Get all possible price IDs for each plan
      const priceIdToPlan = {
        [STRIPE_PLANS.lite.monthlyPriceId.dev]: "lite",
        [STRIPE_PLANS.lite.monthlyPriceId.prod]: "lite",
        [STRIPE_PLANS.lite.yearlyPriceId.dev]: "lite",
        [STRIPE_PLANS.lite.yearlyPriceId.prod]: "lite",
        [STRIPE_PLANS.pro.monthlyPriceId.dev]: "pro",
        [STRIPE_PLANS.pro.monthlyPriceId.prod]: "pro",
        [STRIPE_PLANS.pro.yearlyPriceId.dev]: "pro",
        [STRIPE_PLANS.pro.yearlyPriceId.prod]: "pro",
        [STRIPE_PLANS.business.monthlyPriceId.dev]: "business",
        [STRIPE_PLANS.business.monthlyPriceId.prod]: "business",
        [STRIPE_PLANS.business.yearlyPriceId.dev]: "business",
        [STRIPE_PLANS.business.yearlyPriceId.prod]: "business",
      } as const;

      plan = priceIdToPlan[priceId as keyof typeof priceIdToPlan];

      if (!plan) {
        console.error(`Invalid price ID: ${priceId}`);
        throw new Error(`Invalid price ID: ${priceId}`);
      }

      await db
        .update(users)
        .set({ plan })
        .where(eq(users.stripeCustomerId, subscription.customer as string));
    }

    // Handle subscription deletions
    if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object as Stripe.Subscription;

      await db
        .update(users)
        .set({ plan: "free" })
        .where(eq(users.stripeCustomerId, subscription.customer as string));
    }

    // Handle failed payments
    if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object as Stripe.Invoice;

      // You might want to notify the user or take other actions
      console.error(`Payment failed for customer ${invoice.customer}`);
    }

    // Handle customer deletion
    if (event.type === "customer.deleted") {
      const customer = event.data.object as Stripe.Customer;

      await db
        .update(users)
        .set({
          plan: "free",
          stripeCustomerId: null,
        })
        .where(eq(users.stripeCustomerId, customer.id));
    }

    revalidatePath("/");
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Stripe webhook error:", error);
    return NextResponse.json(
      { error: "Webhook handler failed" },
      { status: 400 }
    );
  }
}

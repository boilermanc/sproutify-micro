import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = "Sproutify Micro <hello@sproutify.app>";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface EmailRequest {
  to: string;
  template: "welcome" | "subscription_confirmed" | "subscription_cancelled" | "payment_failed";
  data: {
    farmName?: string;
    tierName?: string;
    tierPrice?: string;
    userName?: string;
    [key: string]: string | undefined;
  };
}

// Email templates
const getEmailContent = (template: string, data: EmailRequest["data"]) => {
  switch (template) {
    case "welcome":
      return {
        subject: "Welcome to the Sproutify Farmily!",
        html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f8fafc;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #059669 0%, #10b981 100%); padding: 40px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 700;">Welcome to Sproutify!</h1>
              <p style="color: #a7f3d0; margin: 10px 0 0 0; font-size: 16px;">Your microgreen journey starts now</p>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                Hi${data.userName ? ` ${data.userName}` : ""},
              </p>
              <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                Thank you for subscribing to <strong>Sproutify Micro ${data.tierName || ""}</strong>! We're thrilled to welcome you to our growing community of microgreen farmers.
              </p>
              <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                Your farm <strong>${data.farmName || "dashboard"}</strong> is ready and waiting. Here's what you can do next:
              </p>

              <!-- Feature List -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 30px 0;">
                <tr>
                  <td style="padding: 15px; background-color: #f0fdf4; border-radius: 8px; border-left: 4px solid #10b981;">
                    <strong style="color: #065f46;">Set up your varieties</strong>
                    <p style="color: #374151; font-size: 14px; margin: 5px 0 0 0;">Add the microgreens you're growing</p>
                  </td>
                </tr>
                <tr><td style="height: 10px;"></td></tr>
                <tr>
                  <td style="padding: 15px; background-color: #f0fdf4; border-radius: 8px; border-left: 4px solid #10b981;">
                    <strong style="color: #065f46;">Create your first trays</strong>
                    <p style="color: #374151; font-size: 14px; margin: 5px 0 0 0;">Start tracking your growing cycles</p>
                  </td>
                </tr>
                <tr><td style="height: 10px;"></td></tr>
                <tr>
                  <td style="padding: 15px; background-color: #f0fdf4; border-radius: 8px; border-left: 4px solid #10b981;">
                    <strong style="color: #065f46;">Check your Daily Flow</strong>
                    <p style="color: #374151; font-size: 14px; margin: 5px 0 0 0;">See what needs attention each day</p>
                  </td>
                </tr>
              </table>

              <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 30px 0;">
                And don't forget - Sage, your AI growing assistant, is always there to help with questions and suggestions!
              </p>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="https://app.sproutify.app/admin" style="display: inline-block; background-color: #10b981; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">
                      Go to My Farm
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 30px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="color: #6b7280; font-size: 14px; margin: 0 0 10px 0;">
                Questions? We're here to help!
              </p>
              <a href="mailto:team@sproutify.app" style="color: #10b981; text-decoration: none; font-size: 14px;">
                team@sproutify.app
              </a>
              <p style="color: #9ca3af; font-size: 12px; margin: 20px 0 0 0;">
                Happy growing!<br>
                The Sproutify Team
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
        `,
      };

    case "subscription_confirmed":
      return {
        subject: `Your ${data.tierName || "Sproutify"} subscription is active!`,
        html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f8fafc;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #059669 0%, #10b981 100%); padding: 40px; text-align: center;">
              <div style="width: 60px; height: 60px; background-color: rgba(255,255,255,0.2); border-radius: 50%; margin: 0 auto 15px auto; line-height: 60px; font-size: 28px;">
                ✓
              </div>
              <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700;">Subscription Confirmed!</h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                Hi${data.userName ? ` ${data.userName}` : ""},
              </p>
              <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                Great news! Your <strong>${data.tierName || "Sproutify"}</strong> subscription is now active.
              </p>

              <!-- Plan Details Box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f0fdf4; border-radius: 12px; margin: 25px 0;">
                <tr>
                  <td style="padding: 25px;">
                    <table width="100%">
                      <tr>
                        <td style="color: #065f46; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">Your Plan</td>
                      </tr>
                      <tr>
                        <td style="color: #047857; font-size: 24px; font-weight: 700; padding-top: 5px;">
                          ${data.tierName || "Starter"} - $${data.tierPrice || "12.99"}/month
                        </td>
                      </tr>
                      <tr>
                        <td style="color: #065f46; font-size: 14px; padding-top: 10px;">
                          Farm: ${data.farmName || "Your Farm"}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 30px 0;">
                You can manage your subscription anytime from Settings in your Sproutify dashboard.
              </p>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="https://app.sproutify.app/admin/settings" style="display: inline-block; background-color: #10b981; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">
                      View My Subscription
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 30px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                Thank you for being part of the Sproutify Farmily!<br>
                <a href="mailto:team@sproutify.app" style="color: #10b981; text-decoration: none;">team@sproutify.app</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
        `,
      };

    case "subscription_cancelled":
      return {
        subject: "Your Sproutify subscription has been cancelled",
        html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f8fafc;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">
          <!-- Header -->
          <tr>
            <td style="background-color: #fef2f2; padding: 40px; text-align: center;">
              <h1 style="color: #991b1b; margin: 0; font-size: 24px; font-weight: 700;">Subscription Cancelled</h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                Hi${data.userName ? ` ${data.userName}` : ""},
              </p>
              <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                We're sorry to see you go! Your Sproutify subscription has been cancelled.
              </p>
              <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                Your data will remain safe, and you can resubscribe anytime to pick up right where you left off.
              </p>
              <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 30px 0;">
                If there's anything we could have done better, we'd love to hear from you.
              </p>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="https://app.sproutify.app/admin/pricing" style="display: inline-block; background-color: #10b981; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">
                      Resubscribe
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 30px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                We hope to see you again soon!<br>
                <a href="mailto:team@sproutify.app" style="color: #10b981; text-decoration: none;">team@sproutify.app</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
        `,
      };

    case "payment_failed":
      return {
        subject: "Action needed: Payment failed for your Sproutify subscription",
        html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f8fafc;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">
          <!-- Header -->
          <tr>
            <td style="background-color: #fef3c7; padding: 40px; text-align: center;">
              <h1 style="color: #92400e; margin: 0; font-size: 24px; font-weight: 700;">Payment Failed</h1>
              <p style="color: #a16207; margin: 10px 0 0 0; font-size: 14px;">Please update your payment method</p>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                Hi${data.userName ? ` ${data.userName}` : ""},
              </p>
              <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                We weren't able to process your payment for <strong>${data.farmName || "your Sproutify subscription"}</strong>.
              </p>
              <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 30px 0;">
                To keep your farm running smoothly, please update your payment method. Your access may be limited until the payment is resolved.
              </p>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="https://app.sproutify.app/admin/settings" style="display: inline-block; background-color: #f59e0b; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">
                      Update Payment Method
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 30px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                Need help? Contact us at<br>
                <a href="mailto:team@sproutify.app" style="color: #10b981; text-decoration: none;">team@sproutify.app</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
        `,
      };

    default:
      throw new Error(`Unknown email template: ${template}`);
  }
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is not configured");
    }

    const { to, template, data }: EmailRequest = await req.json();

    if (!to || !template) {
      throw new Error("Missing required fields: to, template");
    }

    const { subject, html } = getEmailContent(template, data || {});

    console.log(`Sending ${template} email to ${to}`);

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [to],
        subject,
        html,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error("Resend API error:", result);
      throw new Error(result.message || "Failed to send email");
    }

    console.log(`Email sent successfully: ${result.id}`);

    return new Response(
      JSON.stringify({ success: true, id: result.id }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Email error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});

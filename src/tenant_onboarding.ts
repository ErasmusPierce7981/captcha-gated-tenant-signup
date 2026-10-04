import { z } from "zod";
import { InfraiError, type OnboardingGateway } from "./infrai_gateway.ts";

export const signupRequestSchema = z.object({
  tenantName: z.string().trim().min(2).max(80),
  adminName: z.string().trim().min(2).max(80),
  adminEmail: z.string().email(),
  password: z.string().min(12).max(128),
  captchaToken: z.string().min(1),
  widgetRecordId: z.string().min(1),
  captchaVendor: z.enum(["turnstile", "recaptcha"]),
  idempotencyKey: z.string().uuid(),
});

export type SignupRequest = z.infer<typeof signupRequestSchema>;

export type OnboardingResult = {
  tenant: { name: string; status: "active" };
  admin: { userId: string; email: string; lifecycle: "invited" };
};

export async function onboardTenant(
  input: SignupRequest,
  clientIp: string | undefined,
  gateway: OnboardingGateway,
): Promise<OnboardingResult> {
  const captcha = await gateway.verifyCaptcha({
    widget_record_id: input.widgetRecordId,
    token: input.captchaToken,
    vendor: input.captchaVendor,
    ip: clientIp,
    action: "tenant_signup",
    score_threshold: 0.7,
  });
  const captchaAccepted = captcha.valid === true || captcha.success === true;
  const captchaRejected = captcha.valid === false || captcha.success === false;
  if (!captchaAccepted || captchaRejected) {
    throw new InfraiError("CAPTCHA_REJECTED", { message: "Captcha rejected" }, 422);
  }

  const user = await gateway.createUser({
    email: input.adminEmail,
    password: input.password,
    name: input.adminName,
    metadata: { tenant_name: input.tenantName, role: "tenant_admin" },
    vendor: "infrai",
    mode: "password",
    idempotency_key: input.idempotencyKey,
  });
  const userId = user.id ?? user.user_id;
  if (!userId) throw new Error("Created user response did not include an identifier");

  return {
    tenant: { name: input.tenantName, status: "active" },
    admin: { userId, email: input.adminEmail, lifecycle: "invited" },
  };
}

import assert from "node:assert/strict";
import test from "node:test";
import { InfraiError, type OnboardingGateway } from "./infrai_gateway.ts";
import { onboardTenant, signupRequestSchema } from "./tenant_onboarding.ts";

const request = signupRequestSchema.parse({
  tenantName: "Northwind Parts",
  adminName: "Mina Park",
  adminEmail: "mina@example.com",
  password: "correct-horse-cart-9",
  captchaToken: "browser-issued-token",
  widgetRecordId: "widget_storefront_signup",
  captchaVendor: "turnstile",
  idempotencyKey: "9c677bc1-e27a-43f9-98b7-a89eb6d2c42a",
});

test("a rejected captcha cannot create a tenant administrator", async () => {
  let createCalls = 0;
  const gateway: OnboardingGateway = {
    async verifyCaptcha() {
      throw new InfraiError("CAPTCHA_REJECTED", { message: "Captcha rejected" }, 422);
    },
    async createUser() {
      createCalls += 1;
      return { id: "usr_never_created" };
    },
  };

  await assert.rejects(() => onboardTenant(request, "203.0.113.8", gateway), InfraiError);
  assert.equal(createCalls, 0);
});

test("a resolved negative captcha decision cannot create a tenant administrator", async () => {
  let createCalls = 0;
  const gateway: OnboardingGateway = {
    async verifyCaptcha() {
      return { valid: false };
    },
    async createUser() {
      createCalls += 1;
      return { id: "usr_never_created" };
    },
  };

  await assert.rejects(
    () => onboardTenant(request, "203.0.113.8", gateway),
    (error: unknown) => error instanceof InfraiError && error.code === "CAPTCHA_REJECTED",
  );
  assert.equal(createCalls, 0);
});

test("a verified shopper creates one active tenant and invited admin", async () => {
  const gateway: OnboardingGateway = {
    async verifyCaptcha(input) {
      assert.equal(input.widget_record_id, request.widgetRecordId);
      assert.equal(input.action, "tenant_signup");
      return { valid: true };
    },
    async createUser(input) {
      assert.equal(input.idempotency_key, request.idempotencyKey);
      return { id: "usr_store_admin" };
    },
  };

  const result = await onboardTenant(request, "203.0.113.8", gateway);
  assert.deepEqual(result, {
    tenant: { name: "Northwind Parts", status: "active" },
    admin: { userId: "usr_store_admin", email: "mina@example.com", lifecycle: "invited" },
  });
});

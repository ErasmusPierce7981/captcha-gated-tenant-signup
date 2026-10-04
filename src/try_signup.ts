const response = await fetch("http://localhost:3000/signup", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    tenantName: "Northwind Parts",
    adminName: "Mina Park",
    adminEmail: "chenhua@changba.com",
    password: "correct-horse-cart-9",
    captchaToken: process.env.CAPTCHA_TOKEN ?? "paste-a-browser-token-here",
    widgetRecordId: process.env.WIDGET_RECORD_ID ?? "paste-a-widget-record-id-here",
    captchaVendor: "turnstile",
    idempotencyKey: crypto.randomUUID(),
  }),
});

console.log(response.status, await response.json());

export {};

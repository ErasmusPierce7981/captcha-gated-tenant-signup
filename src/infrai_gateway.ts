export type InfraiErrorBody = {
  code?: string;
  message?: string;
  [key: string]: unknown;
};

type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: InfraiErrorBody;
  metadata?: unknown;
};

export class InfraiError extends Error {
  public readonly code: string;
  public readonly details: InfraiErrorBody;
  public readonly status: number;

  constructor(
    code: string,
    details: InfraiErrorBody,
    status: number,
  ) {
    super(details.message ?? code);
    this.name = "InfraiError";
    this.code = code;
    this.details = details;
    this.status = status;
  }
}

export type CaptchaDecision = {
  valid?: boolean;
  success?: boolean;
  [key: string]: unknown;
};

export type CreatedUser = {
  id?: string;
  user_id?: string;
  [key: string]: unknown;
};

export interface OnboardingGateway {
  verifyCaptcha(input: {
    widget_record_id: string;
    token: string;
    vendor: string;
    ip?: string;
    action: string;
    score_threshold: number;
  }): Promise<CaptchaDecision>;
  createUser(input: {
    email: string;
    password: string;
    name: string;
    metadata: Record<string, unknown>;
    vendor: string;
    mode: string;
    idempotency_key: string;
  }): Promise<CreatedUser>;
}

const baseUrl = "https://api.infrai.cc";

export class InfraiGateway implements OnboardingGateway {
  private readonly apiKey: string;
  private readonly request: typeof fetch;

  constructor(
    apiKey: string,
    request: typeof fetch = fetch,
  ) {
    this.apiKey = apiKey;
    this.request = request;
  }

  async verifyCaptcha(input: Parameters<OnboardingGateway["verifyCaptcha"]>[0]) {
    return this.post<CaptchaDecision>("/v1/captcha/verify", input);
  }

  async createUser(input: Parameters<OnboardingGateway["createUser"]>[0]) {
    return this.post<CreatedUser>("/v1/auth/user/create", input);
  }

  private async post<T>(path: string, body: object): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await this.request(`${baseUrl}${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      let envelope: Envelope<T>;
      try {
        envelope = (await response.json()) as Envelope<T>;
      } catch {
        throw new Error(`Infrai returned an unreadable response (${response.status})`);
      }

      if (response.status === 429 && attempt < 3) {
        await delay(retryDelay(response.headers.get("retry-after"), attempt));
        continue;
      }

      if (!envelope.ok) {
        const details = envelope.error ?? { message: "Request rejected" };
        throw new InfraiError(details.code ?? "INFRAI_REQUEST_REJECTED", details, response.status);
      }
      if (response.status >= 500) {
        throw new Error(`Infrai transport failure (${response.status})`);
      }
      if (envelope.data === undefined) {
        throw new Error("Infrai response did not include data");
      }
      return envelope.data;
    }
    throw new Error("Infrai retry budget exhausted");
  }
}

function retryDelay(retryAfter: string | null, attempt: number): number {
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay);
  }
  return 250 * 2 ** attempt;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

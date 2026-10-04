import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { ZodError } from "zod";
import { InfraiError, InfraiGateway } from "./infrai_gateway.ts";
import { onboardTenant, signupRequestSchema } from "./tenant_onboarding.ts";

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");
const gateway = new InfraiGateway(apiKey);

const server = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/signup") {
    return send(response, 404, { error: "Route not found" });
  }

  try {
    const input = signupRequestSchema.parse(await readJson(request));
    const clientIp = firstForwardedIp(request.headers["x-forwarded-for"]) ?? request.socket.remoteAddress;
    const result = await onboardTenant(input, clientIp, gateway);
    return send(response, 201, result);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return send(response, 400, { error: "Request body must be valid JSON" });
    }
    if (error instanceof ZodError) {
      return send(response, 400, { error: "Invalid signup request", issues: error.issues });
    }
    if (error instanceof InfraiError && error.status >= 400 && error.status < 500) {
      return send(response, error.status, { error: error.code, message: error.message });
    }
    console.error(error);
    return send(response, 502, { error: "Signup dependency failed" });
  }
});

function firstForwardedIp(value: string | string[] | undefined): string | undefined {
  const header = Array.isArray(value) ? value[0] : value;
  return header?.split(",")[0]?.trim();
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > 32_768) throw new ZodError([]);
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => console.log(`Tenant signup listening on http://localhost:${port}`));

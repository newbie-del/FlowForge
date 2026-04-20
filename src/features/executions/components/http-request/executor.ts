import Handlebars from "handlebars";
import { NonRetriableError } from "inngest";
import ky, { type Options as KyOptions } from "ky";
import type { NodeExecutor } from "@/features/executions/types";
import { httpRequestChannel } from "@/inngest/channels/http-request";

Handlebars.registerHelper("json", (context) => {
  const jsonString = JSON.stringify(context, null, 2);
  const safeString = new Handlebars.SafeString(jsonString);

  return safeString;
});

type HttpRequestData = {
  variableName?: string;
  endpoint?: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: string;
  headersJson?: string;
};

export const httpRequestExecutor: NodeExecutor<HttpRequestData> = async ({
  data,
  nodeId,
  context,
  step,
  publish,
}) => {
  await publish(
    httpRequestChannel().status({
      nodeId,
      status: "loading",
    }),
  );

  try {
    const result = await step.run(`http-request-${nodeId}`, async () => {
      if (!data.endpoint) {
        await publish(
          httpRequestChannel().status({
            nodeId,
            status: "error",
          }),
        );
        throw new NonRetriableError(
          "HTTP Request node: No endpoint configured",
        );
      }

      if (!data.variableName) {
        await publish(
          httpRequestChannel().status({
            nodeId,
            status: "loading",
          }),
        );
        throw new NonRetriableError(
          "HTTP Request node:Variable name not configured",
        );
      }

      if (!data.method) {
        await publish(
          httpRequestChannel().status({
            nodeId,
            status: "loading",
          }),
        );
        throw new NonRetriableError(
          "HTTP Request node: Method name not configured",
        );
      }

      const endpoint = Handlebars.compile(data.endpoint)(context);
      const method = data.method;

      const options: KyOptions = { method };

      // Parse and merge custom headers
      let customHeaders: Record<string, string> = {};
      if (data.headersJson) {
        try {
          const parsed = JSON.parse(data.headersJson);
          // Support template variables in header values
          customHeaders = Object.entries(parsed).reduce(
            (acc, [key, value]) => {
              if (typeof value === "string") {
                acc[key] = Handlebars.compile(value)(context);
              } else {
                acc[key] = String(value);
              }
              return acc;
            },
            {} as Record<string, string>,
          );
        } catch (_e) {
          // If headers aren't valid JSON, try using as-is
          customHeaders = {};
        }
      }

      if (["POST", "PUT", "PATCH"].includes(method)) {
        const resolved = Handlebars.compile(data.body)(context);
        JSON.parse(resolved);
        options.body = resolved;
        options.headers = {
          "Content-Type": "application/json",
          ...customHeaders,
        };
      } else {
        // For GET, DELETE, etc., still apply custom headers
        if (Object.keys(customHeaders).length > 0) {
          options.headers = customHeaders;
        }
      }

      const response = await ky(endpoint, options);
      const contentType = response.headers.get("content-type");
      const responseData = contentType?.includes("application/json")
        ? await response.json()
        : await response.text();

      const responsePayload = {
        httpResponse: {
          status: response.status,
          statusText: response.statusText,
          data: responseData,
        },
      };

      return {
        ...context,
        [data.variableName]: responsePayload,
      };
    });

    await publish(
      httpRequestChannel().status({
        nodeId,
        status: "success",
      }),
    );
    return result;
  } catch (error) {
    await publish(
      httpRequestChannel().status({
        nodeId,
        status: "error",
      }),
    );
    throw error;
  }
};

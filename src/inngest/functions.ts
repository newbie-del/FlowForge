import prisma from "@/lib/db";
import { inngest } from "./client";
import { createGoogleGenerativeAI, google } from "@ai-sdk/google";
import { generateText } from "ai";

const googleAI = createGoogleGenerativeAI();

export const execute = inngest.createFunction(
  { id: "execute-ai", },
  { event: "execute/ai" },
  async ({ event, step }) => {
    await step.sleep("pretend", "5s");
    const { steps } = await step.ai.wrap("gemini-generated-text", generateText, 
      {
      model: google("gemini-2.5-flash"),
      system: "You are a helpful assistant.",
      prompt: "What is 2+2?"
    });
    return steps;
  },
);
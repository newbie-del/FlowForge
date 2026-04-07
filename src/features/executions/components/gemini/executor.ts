import type { NodeExecutor } from "@/features/executions/types";
import { NonRetriableError } from "inngest";
import {createGoogleGenerativeAI} from "@ai-sdk/google";
import {generateText} from "ai";
import Handlebars from "handlebars";
import { geminiChannel } from "@/inngest/channels/gemini";
import prisma from "@/lib/db";

Handlebars.registerHelper("json", (context) => {
    const jsonString = JSON.stringify(context, null, 2);
    const safeString = new Handlebars.SafeString(jsonString);
    
    return safeString;
});

type GeminiData = {
    variableName?: string;
    credentialId?: string;
    systemPrompt?: string;
    userPrompt?: string;
};

export const geminiExecutor: NodeExecutor<GeminiData> = async ({ 
    data,
    nodeId,
    userId,
    context,
    step,
    publish,
}) => {
    console.log('[geminiExecutor] Starting execution for node:', nodeId);
    console.log('[geminiExecutor] Publishing loading status...');
    
    await publish(
        geminiChannel().status({
            nodeId,
            status: "loading",
        }),
    );
    
    console.log('[geminiExecutor] Loading status published');

    if (!data.variableName) {
        await publish(
            geminiChannel().status({
                nodeId,
                status: "error",
            })
        );
        throw new NonRetriableError("Gemini node: variable Name is required");
    }

    if (!data.credentialId) {
        await publish(
            geminiChannel().status({
                nodeId,
                status: "error",
            })
        );
        throw new NonRetriableError("Gemini node: Credential is requierd");
    }

    if (!data.userPrompt) {
         await publish(
            geminiChannel().status({
                nodeId,
                status: "error",
            })
        );
        throw new NonRetriableError("Gemini node: User Prompt is required");
    }

    
    const systemPrompt = data.systemPrompt
        ? Handlebars.compile(data.systemPrompt)(context)
        : "You are a helpful assistant.";

    const userPrompt = Handlebars.compile(data.userPrompt)(context);


    const credential = await step.run("get-credential", () => {
        return prisma.credential.findUnique({
            where: {
                id: data.credentialId,  //this can b injectted
                userId,
            },
        });
    });

    if (!credential) {
        await publish(
            geminiChannel().status({
                nodeId,
                status: "error",
            })
        );
        throw new NonRetriableError("Gemini node: Credential not found");
    }

    const google = createGoogleGenerativeAI({
        apiKey: credential.value,
    });

    try {
        const {steps} = await step.ai.wrap(
            "gemini-generate-text",
            generateText,
            {
                model: google( "gemini-2.5-flash"),
                system: systemPrompt,
                prompt: userPrompt,
                experimental_telemetry: {
                    isEnabled: true,
                    recordInputs: true,
                    recordOutputs: true,
                },
            },
        );

        const text =
            steps[0].content[0].type === "text"
                ? steps[0].content[0].text
                : "";

        await publish(
            geminiChannel().status({
                nodeId,
                status: "success",        
            }),
        );

        return {
            ...context,
            [data.variableName]: {
                text,
            },
        }
    } catch (error) {
        await publish(
            geminiChannel().status({
                nodeId,
                status: "error",
            }),
        );

        throw error;

    }
};

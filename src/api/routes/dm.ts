import { Elysia } from "elysia";
import { dmUser } from "../../index.ts";

export const dmEndpoint = new Elysia({ prefix: "/admin/dm" }).post(
    "/",
    async ({ query, body }) => {
        const key = query.key;
        const json = body as { provider: string; uid: string; message: string };

        if (!json)
            return new Response("No JSON body provided", { status: 400 });

        const provider = json.provider;
        const uid = json.uid;
        const message = json.message;

        if (!key) return new Response("No key provided", { status: 400 });
        if (key !== process.env.API_SIGNING_KEY)
            return new Response("Invalid key", { status: 401 });
        if (!provider || !uid || !message)
            return new Response("Missing provider, uid, or message", {
                status: 400,
            });

        const response = await dmUser(uid, provider, message);
        if (response instanceof Error)
            return { status: 500, message: response.message };
        return new Response("Message sent", { status: 200 });
    },
);

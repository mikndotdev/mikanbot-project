import { Elysia } from "elysia";
import { dmUser } from "..";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const app = new Elysia();

app.post("/accLink", async ({ query, body }) => {
    const key = query.key;
    const json = body as { uid: string; acc: string };

    const uid = json.uid;
    const acc = json.acc;

    if (!key) return new Response("No key provided", { status: 400 });
    if (!uid || !acc)
        return new Response("Missing uid or account information", {
            status: 400,
        });

    if (key !== process.env.API_SIGNING_KEY)
        return new Response("Invalid key", { status: 401 });

    const user = await prisma.user.findUnique({
        where: {
            id: uid,
        },
    });

    if (!user) return new Response("User not found", { status: 404 });

    await prisma.user.update({
        where: {
            id: uid,
        },
        data: {
            mdUID: acc,
        },
    });

    await dmUser(
        uid,
        "MikanDev Accounts",
        `Your account has been linked!\n\n**MikanDev UID:** ${acc}\n**Discord ID:**${uid}`,
    );

    return new Response("Account linked", { status: 200 });
});

app.post("/dm", async ({ query, body }) => {
    const key = query.key;
    const json = body as { provider: string; uid: string; message: string };

    if (!json) return new Response("No JSON body provided", { status: 400 });

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
});

export function start() {
    app.listen(process.env.API_PORT || 3000, () => {
        console.log(`Server started on port ${process.env.API_PORT || 3000}`);
    });
}

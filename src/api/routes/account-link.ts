import { Elysia } from "elysia";
import { dmUser } from "../../index.ts";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const AcclinkEndpoint = new Elysia({ prefix: "/admin/link" }).post(
    "/",
    async ({ query, body }) => {
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
    },
);

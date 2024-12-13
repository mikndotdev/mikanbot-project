import { Elysia } from "elysia";
import { swagger } from "@elysiajs/swagger";
import { AcclinkEndpoint } from "./routes/account-link.ts";
import { dmEndpoint } from "./routes/dm.ts";

export const app = new Elysia({ aot: false }).onError(({ code, error }) => {
    console.log(code);
    return new Response(JSON.stringify({ error: error.toString() ?? code }), {
        status: 500,
    });
});

app.use(
    swagger({
        path: "/",
        documentation: {
            info: {
                title: "MikanBot API",
                version: "1.0.0",
            },
        },
        exclude: ["/admin/*"],
    }),
);

app.use(AcclinkEndpoint);
app.use(dmEndpoint);

export function start() {
    app.listen(process.env.API_PORT || 3000, () => {
        console.log(`Server started on port ${process.env.API_PORT || 3000}`);
    });
}

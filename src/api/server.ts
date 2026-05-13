import { Elysia } from "elysia";
import { swagger } from "@elysiajs/swagger";
import { AcclinkEndpoint } from "@/api/routes/account-link";
import { dmEndpoint } from "@/api/routes/dm";
import { env } from "@/lib/env";

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
  app.listen(env.API_PORT, () => {
    console.log(`Server started on port ${env.API_PORT}`);
  });
}

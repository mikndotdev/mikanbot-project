import { Elysia } from "elysia";

const app = new Elysia();

app.post("/accLink", async ({ query, body }) => {
    const key = query.key
    const json = body

    const uid = json.uid
    const acc = json.acc

    if(!key) return { status: 400, message: "No key provided" }
    if(!uid) return { status: 400, message: "No uid provided" }
    if(!acc) return { status: 400, message: "No acc provided" }

    if(key !== process.env.API_SIGNING_KEY) return { status: 401, message: "Invalid key" }

})

export function start () {
    app.listen(process.env.API_PORT || 3000, () => {
        console.log(`Server started on port ${process.env.API_PORT || 3000}`)
    })
}
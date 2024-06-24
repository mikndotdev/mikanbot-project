const { QuickDB, MemoryDriver } = require("quick.db");
const memoryDriver = new MemoryDriver();
const db = new QuickDB({ driver: memoryDriver });

export default function setRatelimit (type, time, user) {
    if(type == "msg") {
        
    }
}
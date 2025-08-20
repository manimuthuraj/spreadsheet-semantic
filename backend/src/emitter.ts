import "./dot-env.config"
import EventEmitter from "events";
import Redis from "ioredis";


const emitter = new EventEmitter();
const CHANNEL = "sheetUpdates";

if (!process.env.REDIS_URL) throw new Error("Redis IRL not found")

const pub = new Redis(process.env.REDIS_URL);
const sub = new Redis(process.env.REDIS_URL);

// Listen for Redis messages and re-emit locally
sub.subscribe(CHANNEL, (err) => {
    if (err) console.error("Redis subscribe error", err);
});

sub.on("message", (_, message) => {
    try {
        const parsed = JSON.parse(message);
        emitter.emit(CHANNEL, parsed, true); // 👈 pass skipPublish = true
    } catch (err) {
        console.error("Invalid message from Redis", err);
    }
});

// Override emitter.emit to also publish to Redis
const originalEmit = emitter.emit.bind(emitter);
emitter.emit = (event: string, data: any, skipPublish = false) => {
    if (event === CHANNEL && !skipPublish) {
        pub.publish(CHANNEL, JSON.stringify(data));
    }
    return originalEmit(event, data);
};

export default emitter;
export { CHANNEL };



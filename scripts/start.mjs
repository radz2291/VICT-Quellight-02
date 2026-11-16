import { readRuntimeConfig } from '../config/runtime.mjs';

const config = readRuntimeConfig(process.env);
process.env.HOST = config.host;
process.env.PORT = String(config.port);
if (config.origin) process.env.ORIGIN = config.origin;
console.log(`Starting Quellight ${config.mode} (${config.deployment}).`);
await import('../build/index.js');

import { createFarmAssistantHandler } from './handler.mjs';
Deno.serve(createFarmAssistantHandler({ env: (name: string) => Deno.env.get(name) }));

import { FastifyRequest, FastifyReply } from 'fastify';
import { env } from '../config.js';

export async function apiKeyAuth(request: FastifyRequest, reply: FastifyReply) {
  const apiKey = request.headers['x-api-key'];
  if (apiKey !== env.ADMIN_API_KEY) {
    return reply.status(401).send({ error: 'Invalid API key' });
  }
}

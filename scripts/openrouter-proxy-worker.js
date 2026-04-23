/**
 * Cloudflare Worker — прокси для OpenRouter API.
 * Скрывает API-ключ от публичного сайта.
 *
 * Деплой:
 *   1. dash.cloudflare.com → Workers & Pages → Create → Create Worker
 *   2. Скопировать этот файл в редактор → Deploy
 *   3. Settings → Variables and Secrets → Add variable:
 *        - OPENROUTER_API_KEY (type: Secret) = sk-or-v1-...
 *        - ALLOWED_ORIGINS (type: Text) = https://nickstr11.github.io
 *   4. Скопировать URL воркера (вида https://<name>.<subdomain>.workers.dev)
 *   5. Вставить в app.js как OPENROUTER_PROXY_URL
 *
 * Защита:
 *   - Проверка Origin — пускает только с github.io
 *   - Rate limit 60 req/min на IP
 */

const RATE_LIMIT_PER_MIN = 60;
const rateLimitCache = new Map();

function cleanupRateLimit(now) {
    for (const [ip, data] of rateLimitCache.entries()) {
        if (now - data.resetAt > 60000) rateLimitCache.delete(ip);
    }
}

function checkRateLimit(ip) {
    const now = Date.now();
    if (rateLimitCache.size > 1000) cleanupRateLimit(now);
    const entry = rateLimitCache.get(ip);
    if (!entry || now - entry.resetAt > 60000) {
        rateLimitCache.set(ip, { count: 1, resetAt: now });
        return true;
    }
    entry.count++;
    return entry.count <= RATE_LIMIT_PER_MIN;
}

export default {
    async fetch(request, env) {
        const allowedOrigins = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
        const origin = request.headers.get('Origin') || '';
        const isAllowed = allowedOrigins.length === 0 || allowedOrigins.includes(origin);

        const corsHeaders = {
            'Access-Control-Allow-Origin': isAllowed ? origin : allowedOrigins[0] || '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Max-Age': '86400',
        };

        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: corsHeaders });
        }

        if (request.method !== 'POST') {
            return new Response(JSON.stringify({ error: 'Method not allowed' }), {
                status: 405,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        if (!isAllowed) {
            return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
                status: 403,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
        if (!checkRateLimit(ip)) {
            return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
                status: 429,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        if (!env.OPENROUTER_API_KEY) {
            return new Response(JSON.stringify({ error: 'Server misconfigured: no API key' }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        // Проксируем запрос в OpenRouter
        const body = await request.text();
        const upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
                'HTTP-Referer': 'https://nickstr11.github.io/pharma-study-helper/',
                'X-Title': 'Pharma Study Helper',
            },
            body,
        });

        const responseBody = await upstream.text();
        return new Response(responseBody, {
            status: upstream.status,
            headers: {
                ...corsHeaders,
                'Content-Type': upstream.headers.get('Content-Type') || 'application/json',
            },
        });
    },
};

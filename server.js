const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const host = '0.0.0.0';
const port = Number(process.env.PORT || 4173);
const rootDir = __dirname;
const openAiApiKey = process.env.OPENAI_API_KEY;
const openAiModel = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
const adminApiToken = process.env.ADMIN_API_TOKEN || '';
const ownerUsername = process.env.OWNER_USERNAME || 'owner';
const ownerPassword = process.env.OWNER_PASSWORD || 'change-this-password';
const ownerEmailUrl = process.env.OWNER_EMAIL_URL || 'https://mail.google.com/';
const ownerAriUrl = process.env.OWNER_ARI_URL || 'https://www.arifleet.com/';
const ownerSessionTtlMs = Number(process.env.OWNER_SESSION_TTL_MS || 8 * 60 * 60 * 1000);
const sessionTtlMs = Number(process.env.CHAT_SESSION_TTL_MS || 30 * 60 * 1000);
const maxSessionMessages = Number(process.env.CHAT_SESSION_MESSAGES || 16);
const rateLimitWindowMs = Number(process.env.RATE_LIMIT_WINDOW_MS || 60 * 1000);
const rateLimitMaxRequests = Number(process.env.RATE_LIMIT_MAX_REQUESTS || 8);
const logMaxBytes = Number(process.env.LOG_MAX_BYTES || 1024 * 1024);
const logMaxFiles = Number(process.env.LOG_MAX_FILES || 5);
const dataDir = path.join(rootDir, 'data');
const logsDir = path.join(rootDir, 'logs');
const databaseFile = path.join(dataDir, 'chat.sqlite');
const requestLogFile = path.join(logsDir, 'requests.log');

const rateLimits = new Map();
const ownerSessions = new Map();

const systemPrompt = [
  'You are the Hoodz Customs AI mechanic assistant for a performance garage.',
  'Give concise, practical automotive guidance for diagnostics, maintenance, performance upgrades, detailing, and intake questions.',
  'Ask for year, make, model, mileage, symptoms, warning lights, and recent work when details are missing.',
  'Do not invent repairs or claim certainty without evidence.',
  'Flag urgent safety issues clearly, especially brake, steering, overheating, fuel leak, or severe engine noise concerns.',
  'Keep answers short, direct, and customer-friendly.'
].join(' ');

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp'
};

fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(logsDir, { recursive: true });

const db = new DatabaseSync(databaseFile);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS chat_sessions (
    session_id TEXT PRIMARY KEY,
    client_ip TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    last_user_message_at INTEGER,
    last_assistant_message_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (session_id) REFERENCES chat_sessions(session_id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id_id
  ON chat_messages(session_id, id DESC);

  CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated_at
  ON chat_sessions(updated_at);
`);

const upsertSessionStatement = db.prepare(`
  INSERT INTO chat_sessions (session_id, client_ip, created_at, updated_at)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(session_id) DO UPDATE SET
    client_ip = excluded.client_ip,
    updated_at = excluded.updated_at
`);

const insertMessageStatement = db.prepare(`
  INSERT INTO chat_messages (session_id, role, content, created_at)
  VALUES (?, ?, ?, ?)
`);

const updateSessionTimestampsStatement = db.prepare(`
  UPDATE chat_sessions
  SET updated_at = ?,
      last_user_message_at = CASE WHEN ? = 'user' THEN ? ELSE last_user_message_at END,
      last_assistant_message_at = CASE WHEN ? = 'assistant' THEN ? ELSE last_assistant_message_at END
  WHERE session_id = ?
`);

const trimSessionMessagesStatement = db.prepare(`
  DELETE FROM chat_messages
  WHERE id IN (
    SELECT id
    FROM chat_messages
    WHERE session_id = ?
    ORDER BY id DESC
    LIMIT -1 OFFSET ?
  )
`);

const selectSessionMessagesStatement = db.prepare(`
  SELECT role, content, created_at
  FROM chat_messages
  WHERE session_id = ?
  ORDER BY id DESC
  LIMIT ?
`);

const deleteExpiredSessionsStatement = db.prepare(`
  DELETE FROM chat_sessions
  WHERE updated_at < ?
`);

const totalSessionsStatement = db.prepare('SELECT COUNT(*) AS count FROM chat_sessions');
const activeSessionsStatement = db.prepare('SELECT COUNT(*) AS count FROM chat_sessions WHERE updated_at >= ?');
const totalMessagesStatement = db.prepare('SELECT COUNT(*) AS count FROM chat_messages');
const sessionHealthStatement = db.prepare(`
  SELECT
    s.session_id,
    s.client_ip,
    s.created_at,
    s.updated_at,
    s.last_user_message_at,
    s.last_assistant_message_at,
    COUNT(m.id) AS message_count
  FROM chat_sessions s
  LEFT JOIN chat_messages m ON m.session_id = s.session_id
  WHERE s.session_id = ?
  GROUP BY s.session_id
`);

function getClientIp(request) {
  const forwardedFor = request.headers['x-forwarded-for'];

  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0].trim();
  }

  return request.socket.remoteAddress || 'unknown';
}

function getSessionIdFromRequest(request) {
  const headerValue = request.headers['x-session-id'];

  if (typeof headerValue !== 'string') {
    return '';
  }

  const trimmed = headerValue.trim();

  return /^[a-zA-Z0-9_-]{12,80}$/.test(trimmed) ? trimmed : '';
}

function isLocalIp(ipAddress) {
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ipAddress);
}

function isAuthorizedAdminRequest(request) {
  if (adminApiToken) {
    return request.headers['x-admin-token'] === adminApiToken;
  }

  return isLocalIp(getClientIp(request));
}

function parseCookies(request) {
  const cookieHeader = request.headers.cookie;

  if (!cookieHeader) {
    return {};
  }

  return cookieHeader.split(';').reduce((accumulator, pair) => {
    const [rawName, ...rest] = pair.split('=');
    const name = rawName.trim();

    if (!name) {
      return accumulator;
    }

    accumulator[name] = decodeURIComponent(rest.join('=').trim());
    return accumulator;
  }, {});
}

function createSetCookieHeader(name, value, options = {}) {
  const attributes = [`${name}=${encodeURIComponent(value)}`];

  attributes.push(`Path=${options.path || '/'}`);
  attributes.push(`SameSite=${options.sameSite || 'Lax'}`);

  if (options.httpOnly !== false) {
    attributes.push('HttpOnly');
  }

  if (options.maxAge !== undefined) {
    attributes.push(`Max-Age=${options.maxAge}`);
  }

  if (options.secure) {
    attributes.push('Secure');
  }

  return attributes.join('; ');
}

function createOwnerSession(username) {
  const now = Date.now();
  const token = crypto.randomBytes(24).toString('hex');

  ownerSessions.set(token, {
    username,
    createdAt: now,
    expiresAt: now + ownerSessionTtlMs
  });

  return token;
}

function getOwnerSession(request) {
  const cookies = parseCookies(request);
  const token = cookies.owner_auth;

  if (!token) {
    return null;
  }

  const session = ownerSessions.get(token);

  if (!session) {
    return null;
  }

  if (Date.now() >= session.expiresAt) {
    ownerSessions.delete(token);
    return null;
  }

  session.expiresAt = Date.now() + ownerSessionTtlMs;
  return { token, ...session };
}

function clearOwnerSessionByRequest(request) {
  const cookies = parseCookies(request);

  if (cookies.owner_auth) {
    ownerSessions.delete(cookies.owner_auth);
  }
}

function ensureSession(sessionId, clientIp) {
  const now = Date.now();
  upsertSessionStatement.run(sessionId, clientIp, now, now);
}

function appendSessionMessage(sessionId, role, content) {
  const now = Date.now();
  insertMessageStatement.run(sessionId, role, content, now);
  updateSessionTimestampsStatement.run(now, role, now, role, now, sessionId);
  trimSessionMessagesStatement.run(sessionId, maxSessionMessages);
}

function getSessionMessages(sessionId) {
  return selectSessionMessagesStatement.all(sessionId, maxSessionMessages).reverse();
}

function cleanupExpiredEntries() {
  const cutoff = Date.now() - sessionTtlMs;
  deleteExpiredSessionsStatement.run(cutoff);

  for (const [key, bucket] of rateLimits.entries()) {
    if (Date.now() - bucket.windowStart >= rateLimitWindowMs) {
      rateLimits.delete(key);
    }
  }

  for (const [token, session] of ownerSessions.entries()) {
    if (Date.now() >= session.expiresAt) {
      ownerSessions.delete(token);
    }
  }
}

function checkRateLimit(key, sessionId, clientIp) {
  const now = Date.now();
  const existing = rateLimits.get(key);

  if (!existing || now - existing.windowStart >= rateLimitWindowMs) {
    const next = { count: 1, windowStart: now, sessionId, clientIp };
    rateLimits.set(key, next);
    return { allowed: true, remaining: Math.max(rateLimitMaxRequests - next.count, 0), retryAfterMs: 0 };
  }

  if (existing.count >= rateLimitMaxRequests) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: Math.max(rateLimitWindowMs - (now - existing.windowStart), 0)
    };
  }

  existing.count += 1;
  return {
    allowed: true,
    remaining: Math.max(rateLimitMaxRequests - existing.count, 0),
    retryAfterMs: 0
  };
}

function rotateLogsIfNeeded(nextEntryBytes) {
  const currentSize = fs.existsSync(requestLogFile) ? fs.statSync(requestLogFile).size : 0;

  if (currentSize + nextEntryBytes <= logMaxBytes) {
    return;
  }

  const oldestFile = `${requestLogFile}.${logMaxFiles}`;

  if (fs.existsSync(oldestFile)) {
    fs.rmSync(oldestFile);
  }

  for (let index = logMaxFiles - 1; index >= 1; index -= 1) {
    const source = `${requestLogFile}.${index}`;
    const target = `${requestLogFile}.${index + 1}`;

    if (fs.existsSync(source)) {
      fs.renameSync(source, target);
    }
  }

  if (fs.existsSync(requestLogFile)) {
    fs.renameSync(requestLogFile, `${requestLogFile}.1`);
  }
}

function getLogFilesStatus() {
  const files = [];

  if (fs.existsSync(requestLogFile)) {
    files.push({ name: path.basename(requestLogFile), sizeBytes: fs.statSync(requestLogFile).size });
  }

  for (let index = 1; index <= logMaxFiles; index += 1) {
    const rotatedFile = `${requestLogFile}.${index}`;

    if (fs.existsSync(rotatedFile)) {
      files.push({ name: path.basename(rotatedFile), sizeBytes: fs.statSync(rotatedFile).size });
    }
  }

  return files;
}

function writeRequestLog(entry) {
  const serialized = `${JSON.stringify({ timestamp: new Date().toISOString(), ...entry })}\n`;

  try {
    rotateLogsIfNeeded(Buffer.byteLength(serialized));
    fs.appendFileSync(requestLogFile, serialized, 'utf8');
  } catch (error) {
    console.error('Failed to write request log:', error.message);
  }
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload));
}

function parseRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';

    request.on('data', (chunk) => {
      body += chunk;

      if (body.length > 100_000) {
        reject(new Error('Request body too large'));
        request.destroy();
      }
    });

    request.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });

    request.on('error', reject);
  });
}

function extractOutputText(payload) {
  if (typeof payload.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const output = Array.isArray(payload.output) ? payload.output : [];

  for (const item of output) {
    const content = Array.isArray(item.content) ? item.content : [];

    for (const block of content) {
      if (typeof block.text === 'string' && block.text.trim()) {
        return block.text.trim();
      }
    }
  }

  return '';
}

function buildSessionHealth(sessionId) {
  const session = sessionHealthStatement.get(sessionId);

  if (!session) {
    return null;
  }

  const messages = getSessionMessages(sessionId).slice(-5).map((message) => ({
    role: message.role,
    createdAt: new Date(message.created_at).toISOString(),
    preview: message.content.slice(0, 160)
  }));

  return {
    sessionId: session.session_id,
    clientIp: session.client_ip,
    createdAt: new Date(session.created_at).toISOString(),
    updatedAt: new Date(session.updated_at).toISOString(),
    lastUserMessageAt: session.last_user_message_at ? new Date(session.last_user_message_at).toISOString() : null,
    lastAssistantMessageAt: session.last_assistant_message_at ? new Date(session.last_assistant_message_at).toISOString() : null,
    messageCount: session.message_count,
    recentMessages: messages
  };
}

function buildHealthPayload(requestUrl) {
  cleanupExpiredEntries();

  const activeBuckets = Array.from(rateLimits.values()).map((bucket) => ({
    sessionId: bucket.sessionId,
    clientIp: bucket.clientIp,
    count: bucket.count,
    remaining: Math.max(rateLimitMaxRequests - bucket.count, 0),
    resetsInMs: Math.max(rateLimitWindowMs - (Date.now() - bucket.windowStart), 0)
  }));

  const sessionId = requestUrl.searchParams.get('sessionId');
  const totalSessions = totalSessionsStatement.get().count;
  const activeSessions = activeSessionsStatement.get(Date.now() - sessionTtlMs).count;
  const totalMessages = totalMessagesStatement.get().count;

  return {
    uptimeSeconds: Math.floor(process.uptime()),
    now: new Date().toISOString(),
    database: {
      file: databaseFile,
      totalSessions,
      activeSessions,
      totalMessages
    },
    logging: {
      file: requestLogFile,
      maxBytes: logMaxBytes,
      maxFiles: logMaxFiles,
      files: getLogFilesStatus()
    },
    rateLimit: {
      windowMs: rateLimitWindowMs,
      maxRequests: rateLimitMaxRequests,
      activeBuckets: activeBuckets.length,
      buckets: activeBuckets.slice(0, 20)
    },
    requestedSession: sessionId ? buildSessionHealth(sessionId) : null
  };
}

async function handleAdminHealth(request, response, requestUrl) {
  if (!isAuthorizedAdminRequest(request)) {
    writeRequestLog({
      type: 'admin_health',
      method: request.method,
      path: requestUrl.pathname,
      ip: getClientIp(request),
      statusCode: 403
    });
    sendJson(response, 403, { error: 'Forbidden' });
    return;
  }

  const payload = buildHealthPayload(requestUrl);
  writeRequestLog({
    type: 'admin_health',
    method: request.method,
    path: requestUrl.pathname,
    ip: getClientIp(request),
    statusCode: 200,
    requestedSessionId: requestUrl.searchParams.get('sessionId') || null
  });
  sendJson(response, 200, payload);
}

async function handleOwnerLogin(request, response) {
  let payload;

  try {
    payload = await parseRequestBody(request);
  } catch (error) {
    sendJson(response, 400, { error: error.message });
    return;
  }

  const username = String(payload.username || '').trim();
  const password = String(payload.password || '');

  if (username !== ownerUsername || password !== ownerPassword) {
    writeRequestLog({
      type: 'owner_login',
      method: request.method,
      path: '/api/admin/login',
      ip: getClientIp(request),
      statusCode: 401,
      reason: 'invalid_credentials'
    });
    sendJson(response, 401, { error: 'Invalid username or password.' });
    return;
  }

  const token = createOwnerSession(username);
  response.setHeader(
    'Set-Cookie',
    createSetCookieHeader('owner_auth', token, {
      maxAge: Math.floor(ownerSessionTtlMs / 1000),
      secure: process.env.NODE_ENV === 'production'
    })
  );

  writeRequestLog({
    type: 'owner_login',
    method: request.method,
    path: '/api/admin/login',
    ip: getClientIp(request),
    statusCode: 200,
    ownerUsername: username
  });

  sendJson(response, 200, { ok: true });
}

function handleOwnerLogout(request, response) {
  clearOwnerSessionByRequest(request);
  response.setHeader('Set-Cookie', createSetCookieHeader('owner_auth', '', { maxAge: 0 }));
  sendJson(response, 200, { ok: true });
}

function handleOwnerSession(request, response) {
  const session = getOwnerSession(request);

  if (!session) {
    sendJson(response, 200, { authenticated: false });
    return;
  }

  response.setHeader(
    'Set-Cookie',
    createSetCookieHeader('owner_auth', session.token, {
      maxAge: Math.floor(ownerSessionTtlMs / 1000),
      secure: process.env.NODE_ENV === 'production'
    })
  );
  sendJson(response, 200, { authenticated: true, username: session.username });
}

function handleOwnerDashboardData(request, response) {
  const session = getOwnerSession(request);

  if (!session) {
    sendJson(response, 401, { error: 'Unauthorized' });
    return;
  }

  const health = buildHealthPayload(new URL('http://localhost/api/admin/health'));
  const inbox = [
    {
      label: 'Build Team Inbox',
      href: 'mailto:builds@hoodzcustoms.com',
      note: 'Open a new message to the shop inbox.'
    },
    {
      label: 'Webmail',
      href: ownerEmailUrl,
      note: 'Open your configured email dashboard.'
    }
  ];

  sendJson(response, 200, {
    username: session.username,
    links: {
      ari: ownerAriUrl,
      email: ownerEmailUrl
    },
    inbox,
    health
  });
}

async function handleChat(request, response) {
  cleanupExpiredEntries();

  const clientIp = getClientIp(request);
  const sessionId = getSessionIdFromRequest(request) || crypto.randomUUID().replace(/-/g, '');
  const limiterKey = `${clientIp}:${sessionId}`;
  const rateLimit = checkRateLimit(limiterKey, sessionId, clientIp);

  response.setHeader('X-Session-Id', sessionId);
  response.setHeader('X-RateLimit-Limit', String(rateLimitMaxRequests));
  response.setHeader('X-RateLimit-Remaining', String(rateLimit.remaining));

  if (!rateLimit.allowed) {
    const retryAfterSeconds = Math.ceil(rateLimit.retryAfterMs / 1000);
    response.setHeader('Retry-After', String(retryAfterSeconds));
    writeRequestLog({
      type: 'chat_rate_limited',
      method: request.method,
      path: '/api/chat',
      ip: clientIp,
      sessionId,
      statusCode: 429,
      retryAfterSeconds
    });
    sendJson(response, 429, {
      error: 'Rate limit exceeded. Please wait and try again.',
      retryAfterSeconds
    });
    return;
  }

  let payload;

  try {
    payload = await parseRequestBody(request);
  } catch (error) {
    writeRequestLog({
      type: 'chat_request',
      method: request.method,
      path: '/api/chat',
      ip: clientIp,
      sessionId,
      statusCode: 400,
      reason: 'invalid_request_body',
      details: error.message
    });
    sendJson(response, 400, { error: error.message });
    return;
  }

  const submittedMessages = Array.isArray(payload.messages) ? payload.messages : [];
  const userMessages = submittedMessages
    .filter((message) => message && (message.role === 'user' || message.role === 'assistant'))
    .map((message) => ({
      role: message.role,
      content: String(message.content || '').trim()
    }))
    .filter((message) => message.role === 'user' && message.content);

  const latestUserMessage = userMessages.at(-1)?.content || '';

  if (!latestUserMessage) {
    writeRequestLog({
      type: 'chat_request',
      method: request.method,
      path: '/api/chat',
      ip: clientIp,
      sessionId,
      statusCode: 400,
      reason: 'missing_user_message'
    });
    sendJson(response, 400, { error: 'At least one chat message is required.' });
    return;
  }

  ensureSession(sessionId, clientIp);
  appendSessionMessage(sessionId, 'user', latestUserMessage);

  const messages = getSessionMessages(sessionId).map((message) => ({
    role: message.role,
    content: message.content
  }));
  const requestStartedAt = Date.now();

  if (!openAiApiKey) {
    writeRequestLog({
      type: 'chat_request',
      method: request.method,
      path: '/api/chat',
      ip: clientIp,
      sessionId,
      statusCode: 503,
      conversationMessages: messages.length,
      reason: 'missing_openai_key'
    });
    sendJson(response, 503, {
      error: 'Missing OPENAI_API_KEY. Add it to the server environment before using live AI chat.'
    });
    return;
  }

  try {
    const openAiResponse = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openAiApiKey}`
      },
      body: JSON.stringify({
        model: openAiModel,
        max_output_tokens: 320,
        input: [
          {
            role: 'system',
            content: [{ type: 'input_text', text: systemPrompt }]
          },
          ...messages.map((message) => ({
            role: message.role,
            content: [{ type: 'input_text', text: message.content }]
          }))
        ]
      })
    });

    const data = await openAiResponse.json();

    if (!openAiResponse.ok) {
      const details = typeof data.error?.message === 'string' ? data.error.message : 'OpenAI request failed.';
      writeRequestLog({
        type: 'chat_request',
        method: request.method,
        path: '/api/chat',
        ip: clientIp,
        sessionId,
        statusCode: openAiResponse.status,
        durationMs: Date.now() - requestStartedAt,
        promptChars: latestUserMessage.length,
        conversationMessages: messages.length,
        reason: 'openai_error',
        details
      });
      sendJson(response, openAiResponse.status, { error: details });
      return;
    }

    const reply = extractOutputText(data);

    if (!reply) {
      writeRequestLog({
        type: 'chat_request',
        method: request.method,
        path: '/api/chat',
        ip: clientIp,
        sessionId,
        statusCode: 502,
        durationMs: Date.now() - requestStartedAt,
        promptChars: latestUserMessage.length,
        conversationMessages: messages.length,
        reason: 'empty_openai_reply'
      });
      sendJson(response, 502, { error: 'OpenAI returned no assistant text.' });
      return;
    }

    appendSessionMessage(sessionId, 'assistant', reply);
    writeRequestLog({
      type: 'chat_request',
      method: request.method,
      path: '/api/chat',
      ip: clientIp,
      sessionId,
      statusCode: 200,
      durationMs: Date.now() - requestStartedAt,
      promptChars: latestUserMessage.length,
      replyChars: reply.length,
      conversationMessages: getSessionMessages(sessionId).length,
      model: openAiModel
    });
    sendJson(response, 200, { reply });
  } catch (error) {
    writeRequestLog({
      type: 'chat_request',
      method: request.method,
      path: '/api/chat',
      ip: clientIp,
      sessionId,
      statusCode: 500,
      durationMs: Date.now() - requestStartedAt,
      promptChars: latestUserMessage.length,
      conversationMessages: messages.length,
      reason: 'server_error',
      details: error instanceof Error ? error.message : 'Unknown server error'
    });
    sendJson(response, 500, {
      error: 'The AI assistant is temporarily unavailable.',
      details: error instanceof Error ? error.message : 'Unknown server error'
    });
  }
}

function serveFile(response, filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[extension] || 'application/octet-stream';

  const stream = fs.createReadStream(filePath);
  response.writeHead(200, { 'Content-Type': contentType });
  stream.pipe(response);

  stream.on('error', () => {
    response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Unable to read file.');
  });
}

const server = http.createServer(async (request, response) => {
  const requestStartedAt = Date.now();
  const requestUrl = new URL(request.url, `http://${request.headers.host || 'localhost'}`);

  if (requestUrl.pathname === '/api/admin/health') {
    if (request.method !== 'GET') {
      response.writeHead(405, { Allow: 'GET' });
      response.end();
      return;
    }

    await handleAdminHealth(request, response, requestUrl);
    return;
  }

  if (requestUrl.pathname === '/api/admin/login') {
    if (request.method !== 'POST') {
      response.writeHead(405, { Allow: 'POST' });
      response.end();
      return;
    }

    await handleOwnerLogin(request, response);
    return;
  }

  if (requestUrl.pathname === '/api/admin/logout') {
    if (request.method !== 'POST') {
      response.writeHead(405, { Allow: 'POST' });
      response.end();
      return;
    }

    handleOwnerLogout(request, response);
    return;
  }

  if (requestUrl.pathname === '/api/admin/session') {
    if (request.method !== 'GET') {
      response.writeHead(405, { Allow: 'GET' });
      response.end();
      return;
    }

    handleOwnerSession(request, response);
    return;
  }

  if (requestUrl.pathname === '/api/admin/dashboard') {
    if (request.method !== 'GET') {
      response.writeHead(405, { Allow: 'GET' });
      response.end();
      return;
    }

    handleOwnerDashboardData(request, response);
    return;
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/chat') {
    await handleChat(request, response);
    return;
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD, POST' });
    response.end();
    return;
  }

  const relativePath = requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname;

  if (relativePath === '/owner-dashboard.html' && !getOwnerSession(request)) {
    response.writeHead(302, { Location: '/owner-login.html' });
    response.end();
    return;
  }

  const resolvedPath = path.normalize(path.join(rootDir, relativePath));

  if (!resolvedPath.startsWith(rootDir)) {
    response.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Forbidden');
    return;
  }

  fs.stat(resolvedPath, (error, stats) => {
    if (error || !stats.isFile()) {
      writeRequestLog({
        type: 'asset_request',
        method: request.method,
        path: requestUrl.pathname,
        ip: getClientIp(request),
        statusCode: 404,
        durationMs: Date.now() - requestStartedAt
      });
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Not found');
      return;
    }

    if (request.method === 'HEAD') {
      const extension = path.extname(resolvedPath).toLowerCase();
      writeRequestLog({
        type: 'asset_request',
        method: request.method,
        path: requestUrl.pathname,
        ip: getClientIp(request),
        statusCode: 200,
        durationMs: Date.now() - requestStartedAt
      });
      response.writeHead(200, {
        'Content-Type': mimeTypes[extension] || 'application/octet-stream',
        'Content-Length': stats.size
      });
      response.end();
      return;
    }

    writeRequestLog({
      type: 'asset_request',
      method: request.method,
      path: requestUrl.pathname,
      ip: getClientIp(request),
      statusCode: 200,
      durationMs: Date.now() - requestStartedAt,
      bytes: stats.size
    });
    serveFile(response, resolvedPath);
  });
});

server.listen(port, host, () => {
  console.log(`Hoodz Customs server running at http://localhost:${port}`);
  console.log(`SQLite chat storage: ${databaseFile}`);
});
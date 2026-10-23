import generate from './api/generate.js';

function jsonError(status, error) {
  return Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;
    if (pathname === '/api/generate') {
      let body;
      if (request.method === 'POST') {
        // Bound actual bytes read, including requests with no Content-Length.
        const reader = request.body?.getReader();
        const chunks = [];
        let size = 0;
        try {
          if (reader) {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              size += value.byteLength;
              if (size > 16384) {
                await reader.cancel();
                return jsonError(413, '提交内容过长，请精简后重试。');
              }
              chunks.push(value);
            }
          }
          const bytes = new Uint8Array(size);
          let offset = 0;
          for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
          body = new TextDecoder().decode(bytes);
        } catch { return jsonError(400, '提交内容格式不正确。'); }
      }
      // Adapt the existing endpoint to Web Responses; env is request-scoped.
      let response;
      const headers = new Headers();
      const res = {
        statusCode: 200,
        setHeader(name, value) { headers.set(name, value); },
        end(value) { response = new Response(value, { status: this.statusCode, headers }); }
      };
      try {
        await generate({ method: request.method, body }, res, env);
        return response || jsonError(502, '生成暂时失败，请稍后重试。');
      } catch { return jsonError(502, '生成暂时失败，请稍后重试。'); }
    }
    if (pathname === '/' || pathname === '/index.html') {
      if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
      return env.ASSETS.fetch(request);
    }
    return new Response('未找到页面', { status: 404 });
  }
};

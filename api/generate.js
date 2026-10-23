'use strict';
const stages = new Set(['认知', '兴趣', '购买', '忠诚']);
function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}
module.exports = async function handler(req, res, env = process.env) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, { error: '请使用生成标题按钮提交。' });
  }
  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
  catch { return send(res, 400, { error: '提交内容格式不正确。' }); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return send(res, 400, { error: '请填写商品信息。' });
  const { product_name, selling_point, stage } = body;
  if (typeof product_name !== 'string' || !product_name.trim() || [...product_name].length > 30)
    return send(res, 400, { error: '请填写商品名，最多 30 字。' });
  if (typeof selling_point !== 'string' || !selling_point.trim() || [...selling_point].length > 100)
    return send(res, 400, { error: '请填写核心卖点，最多 100 字。' });
  if (!stages.has(stage)) return send(res, 400, { error: '营销段请选择认知、兴趣、购买或忠诚。' });
  const base = env.DIFY_API_BASE?.trim();
  const key = env.DIFY_API_KEY?.trim();
  if (!base || !key) return send(res, 503, { error: '服务尚未配置完成，请联系管理员。' });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    const url = new URL(base.replace(/\/+$/, '') + '/workflows/run');
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
    const response = await fetch(url, {
      method: 'POST', redirect: 'error', signal: controller.signal,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputs: { product_name: product_name.trim(), selling_point: selling_point.trim(), stage }, response_mode: 'blocking', user: 'xiaozhou-web' })
    });
    if (!response.ok) return send(res, 502, { error: '生成暂时失败，请稍后重试。' });
    const result = await response.json();
    const outputs = result?.data?.outputs;
    if (result?.data?.status !== 'succeeded' || !outputs || typeof outputs !== 'object') throw new Error();
    const text = value => typeof value === 'string' && value.trim().length > 0;
    // Only return the fields the page needs; never forward the upstream response.
    if (text(outputs.verdict) && text(outputs.draft)) {
      if ([outputs.verdict, outputs.draft].some(value => value.includes(key))) throw new Error();
      return send(res, 200, { type: 'review', verdict: outputs.verdict, draft: outputs.draft });
    }
    if (text(outputs.title)) {
      if (outputs.title.includes(key)) throw new Error();
      return send(res, 200, { type: 'safe', title: outputs.title });
    }
    throw new Error();
  } catch {
    return send(res, controller.signal.aborted ? 504 : 502, { error: controller.signal.aborted ? '请再试一次' : '生成暂时失败，请稍后重试。' });
  } finally { clearTimeout(timer); }
};

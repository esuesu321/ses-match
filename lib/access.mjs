import {createHash, timingSafeEqual} from 'node:crypto';

// The application remains loopback-only. Remote access requires a local HTTPS proxy.
export function createAccess(env, port) {
  const remote = Boolean(env.SES_PUBLIC_ORIGIN);
  let origin;
  if(remote) {
    origin = new URL(env.SES_PUBLIC_ORIGIN);
    if(origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash)
      throw new Error('SES_PUBLIC_ORIGIN must be an HTTPS origin');
    if(!env.SES_AUTH_USER || !env.SES_AUTH_PASSWORD || env.SES_AUTH_PASSWORD.length < 24 || env.SES_AUTH_USER.includes(':'))
      throw new Error('Remote access requires a username and a password of at least 24 characters');
  }
  const hosts = remote ? [origin.host] : [`127.0.0.1:${port}`, `localhost:${port}`];
  const origins = remote ? [origin.origin] : hosts.map(h=>`http://${h}`);
  const expected = createHash('sha256').update(`${env.SES_AUTH_USER}:${env.SES_AUTH_PASSWORD}`).digest();
  let failures=0, windowStart=Date.now();
  return (req,res) => {
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('X-Frame-Options','DENY');
    if(!hosts.includes(req.headers.host)) return {status:403,message:'許可されていない接続先です'};
    if(remote) {
      // Set by the loopback HTTPS proxy; never bind this Node server to the internet.
      if(req.headers['x-forwarded-proto'] !== 'https') return {status:403,message:'HTTPS接続が必要です'};
      res.setHeader('Strict-Transport-Security','max-age=31536000');
      if(Date.now()-windowStart >= 60000) {failures=0;windowStart=Date.now();}
      if(failures >= 20) return {status:429,message:'時間を置いて再試行してください'};
      const auth=String(req.headers.authorization || '');
      const decoded=auth.startsWith('Basic ') && auth.length<4096 ? Buffer.from(auth.slice(6),'base64').toString('utf8') : '';
      const actual=createHash('sha256').update(decoded).digest();
      if(!timingSafeEqual(expected,actual)) {
        failures++;
        res.setHeader('WWW-Authenticate','Basic realm="SES MATCH", charset="UTF-8"');
        return {status:401,message:'本人認証が必要です'};
      }
    }
    if(req.method !== 'GET' && req.headers.origin && !origins.includes(req.headers.origin))
      return {status:403,message:'別サイトからの書き込みはできません'};
    if(req.method !== 'GET' && !String(req.headers['content-type']).includes('application/json'))
      return {status:415,message:'JSON形式で送信してください'};
    return null;
  };
}

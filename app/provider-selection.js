// Startup preference only: never replay a failed task against another provider.
export function codexUsageWindows(payload) {
  const byId=payload?.rateLimitsByLimitId;
  const entries=Object.entries(byId||{});
  const exact=byId?.codex||entries.find(([,b])=>b?.limitId==='codex')?.[1];
  const legacy=payload?.rateLimits||payload;
  const bucket=exact||((!entries.length&&!legacy?.limitId)||legacy?.limitId==='codex'?legacy:null);
  const windows=[bucket?.primary,bucket?.secondary].filter(Boolean);
  return [{label:'Codex · 5시간',minutes:300},{label:'Codex · 주간',minutes:10080}].map(row=>{
    const window=windows.find(w=>w.windowDurationMins===row.minutes);
    return {...row,remaining:Number.isFinite(window?.usedPercent)?Math.max(0,Math.min(100,100-window.usedPercent)):null,resetsAt:window?.resetsAt??null};
  });
}

export function preferGeminiReason(status, model, now = Date.now()) {
  if (status?.account?.type !== 'chatgpt') return 'GPT 로그인 또는 연결을 확인하지 못했습니다.';
  const plan = String(status.account.planType || status.account.plan || '').trim().toLowerCase();
  if (plan === 'free') return 'GPT 무료 계정이므로 Gemini를 우선 선택합니다.';
  const models = status.models || [];
  if (!models.some(m => !Array.isArray(m.inputModalities) || m.inputModalities.includes('image'))) return '사용 가능한 GPT 이미지 모델을 확인하지 못했습니다.';
  const limits = status.rateLimits;
  const byId = limits?.rateLimitsByLimitId;
  // An unrelated model's quota must not disable the selected GPT model.
  const bucket = byId && Object.keys(byId).length ? byId[model] || byId.codex : limits?.rateLimits || limits;
  if (['primary', 'secondary'].some(key => {
    const window = bucket?.[key];
    return Number.isFinite(window?.usedPercent) && window.usedPercent >= 100 && (!Number.isFinite(window.resetsAt) || window.resetsAt * 1000 > now);
  })) return '현재 GPT 사용 한도가 소진되었습니다.';
  return '';
}

export function selectGeminiModel(status, savedModel) {
  if (!status?.available || !status.models?.length) return null;
  return status.models.find(m => m.model === savedModel&&m.available!==false)?.model || status.models.find(m=>m.available!==false)?.model || null;
}

export async function boundedAccountCheck(read, milliseconds = 12000) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(read),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('자동 연결 확인 시간이 초과되었습니다. 연결 확인 버튼으로 다시 시도할 수 있습니다.')), milliseconds); })
    ]);
  } finally { clearTimeout(timer); }
}

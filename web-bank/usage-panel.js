const DB_LIMIT = 500_000_000;
const STORAGE_LIMIT = 1_000_000_000;

const size = bytes => bytes < 1_048_576
  ? `${(bytes / 1024).toFixed(1)} KiB`
  : `${(bytes / 1_048_576).toFixed(1)} MiB`;

function validBytes(value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) throw Error('용량 응답을 확인할 수 없습니다.');
  return number;
}

export function renderUsagePanel({root, rpc, node, action, config}) {
  const panel = node('section', '', 'panel usage-panel');
  const heading = node('div', '', 'usage-heading');
  const status = node('p', '아직 조회하지 않았습니다.', 'hint');
  const figures = node('div', '', 'usage-figures');
  const previousKey = `bank-usage:${new URL(config.url).hostname}:${config.spaceId}`;

  async function refresh() {
    status.textContent = 'Supabase 용량을 조회하고 있습니다…';
    status.className = 'hint';
    try {
      const value = await rpc('bank_project_usage', {s: config.spaceId});
      const db = validBytes(value.databaseBytes);
      const storage = validBytes(value.storageBytes);
      const count = validBytes(value.storageObjects);
      const unknown = validBytes(value.storageUnknownSizeObjects);
      const bank = validBytes(value.bankStorageBytes);
      const measuredAt = new Date(value.measuredAt);
      if (Number.isNaN(measuredAt.getTime())) throw Error('측정 시각을 확인할 수 없습니다.');

      let prior = null;
      try { prior = JSON.parse(sessionStorage.getItem(previousKey) || 'null'); } catch { /* old browser value */ }
      figures.replaceChildren();
      for (const [label, bytes, limit, limitLabel, detail] of [
        ['데이터베이스', db, DB_LIMIT, '500 MB', '테이블·인덱스 등을 포함한 현재 DB 크기'],
        ['파일 저장소', storage, STORAGE_LIMIT, '1 GB', `Storage 객체 ${count.toLocaleString('ko-KR')}개 · 문제은행 버킷 ${size(bank)}`]
      ]) {
        const card = node('div', '', 'usage-card');
        card.append(node('strong', label), node('b', `${size(bytes)} / 무료 ${limitLabel}`));
        const meter = node('progress');
        meter.max = limit;
        meter.value = Math.min(bytes, limit);
        meter.setAttribute('aria-label', `${label} 사용률`);
        card.append(meter, node('small', `${(bytes / limit * 100).toFixed(1)}% · ${detail}`));
        if (bytes >= limit * .8) card.append(node('p', bytes >= limit ? '무료 한도에 도달했습니다. 대시보드를 확인하세요.' : '무료 한도의 80% 이상입니다. 대시보드를 확인하세요.', 'error'));
        figures.append(card);
      }
      if (unknown) figures.append(node('p', `크기 정보가 없는 Storage 객체 ${unknown}개는 위 합계에 포함되지 않았습니다.`, 'error'));
      const previousTime = prior && new Date(prior.measuredAt);
      if (previousTime && !Number.isNaN(previousTime.getTime()) && previousTime < measuredAt) {
        const dbDelta = db - Number(prior.databaseBytes);
        const storageDelta = storage - Number(prior.storageBytes);
        if (Number.isFinite(dbDelta) && Number.isFinite(storageDelta))
          figures.append(node('p', `이 브라우저의 직전 조회 대비: DB ${dbDelta >= 0 ? '+' : '−'}${size(Math.abs(dbDelta))}, Storage ${storageDelta >= 0 ? '+' : '−'}${size(Math.abs(storageDelta))}`, 'hint'));
      }
      sessionStorage.setItem(previousKey, JSON.stringify({measuredAt: value.measuredAt, databaseBytes: db, storageBytes: storage}));
      figures.append(node('p', `DB 문항 레코드 ${Number(value.questions).toLocaleString('ko-KR')}개(보관 포함) · 완료 버전 ${Number(value.committedVersions).toLocaleString('ko-KR')}개`, 'hint'));
      status.textContent = `조회 완료 · ${measuredAt.toLocaleString('ko-KR')}`;
    } catch (error) {
      status.textContent = `용량 조회 실패: ${error.message || String(error)}. 마지막 표시값은 현재 값이 아닙니다.`;
      status.className = 'error';
    }
  }

  heading.append(node('h3', 'Supabase 현재 사용량'), action('지금 갱신', refresh));
  panel.append(heading, status, figures,
    node('p', '버튼을 누를 때만 새로 조회합니다. DB와 Storage는 서로 다른 한도이며 합산하지 않습니다. 이 수치는 현재 DB 크기와 Storage 객체 메타데이터의 합계입니다. 전체 디스크(WAL 포함), 전송량, 조직 사용량과 과금 기준값은 Supabase 대시보드에서 확인하세요.', 'hint'));
  const link = node('a', 'Supabase 대시보드에서 상세 사용량 확인');
  link.href = `https://supabase.com/dashboard/project/${new URL(config.url).hostname.split('.')[0]}`;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  panel.append(link);
  root.append(panel);
  return refresh();
}

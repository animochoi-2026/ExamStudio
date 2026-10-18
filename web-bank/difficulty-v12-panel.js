// Owner-only preparation and explicit approval. No automatic evaluation on render.
export function difficultyV12Panel({root,node,action,invoke,spaceId}){
 const panel=node('details','','panel'),status=node('p','기존 운영 점수를 유지한 채 별도 결과를 준비합니다.','hint'),output=node('div');panel.append(node('summary','난이도 v1.2 재평가'),status,output);root.append(panel);
 let id=null,busy=false,policy=null,resultHash=null,job=null;
 const run=fn=>async()=>{if(busy)return;busy=true;try{await fn();}catch(e){status.textContent=e.message;}finally{busy=false;}};
 const call=(name,args={})=>invoke({action:name,spaceId,id,...args});
 const idInput=node('input');idInput.placeholder='준비한 작업 ID';idInput.setAttribute('aria-label','재평가 작업 ID');panel.append(idInput);
 async function refresh(){job=await call('status');status.textContent=`${job.kind} · ${job.status} · ${job.total}문항 · 기본/재시도 총 ${job.calls}회 (재시도 ${job.retries}회) · ${JSON.stringify(job.counts)}${job.last_error?' · 중단: '+JSON.stringify(job.last_error):''}`;}
 panel.append(action('작업 불러오기',run(async()=>{id=idInput.value.trim();await refresh();})));
 panel.append(action('전체 대상·기존 점수 백업 준비',run(async()=>{policy=await call('policy');const value=await call('prepare',{kind:'full'});id=value.id;idInput.value=id;await call('prepare-next');await refresh();})));
 panel.append(action('진행 상태 확인',run(refresh)));
 panel.append(action('중단된 입력 준비 이어하기',run(async()=>{await call('prepare-retry');await call('prepare-next');await refresh();})));
 panel.append(action('실제 프롬프트·설정 보기',run(async()=>{policy=await call('policy');output.replaceChildren(node('pre',policy.instructions),node('pre',JSON.stringify(policy.settings,null,2)),node('p','프롬프트 SHA256: '+policy.promptHash));})));
 const pilot=node('input');pilot.placeholder='합격한 파일럿 작업 ID';pilot.setAttribute('aria-label','합격 파일럿 작업 ID');panel.append(pilot,action('파일럿 결과 연결·동일 결과 재사용',run(async()=>{await call('attach-pilot',{pilotId:pilot.value.trim()});await refresh();})));
 const cap=node('input');cap.type='number';cap.min='1';cap.placeholder='승인할 총 호출 상한';cap.setAttribute('aria-label','호출 상한');const retries=node('select');for(const n of [0,1,2,3]){const option=node('option',`기술 오류 재시도 최대 ${n}회`);option.value=String(n);retries.append(option);}panel.append(cap,retries);
 panel.append(action('호출 수·추정 비용 확인',run(async()=>{const value=await call('estimate',{maxCalls:Number(cap.value)||undefined});output.replaceChildren(node('p',`기본 ${value.count}회: 약 US$${value.baseUSD.join('~')}. 최대 ${value.maxCalls}회 실행 시 추정 상단 US$${value.withRetriesHighUSD}. 실제 입력·추론 토큰에 따라 달라지는 추정값입니다.`));})));
 panel.append(action('프롬프트·비용 확인 후 실행 승인',run(async()=>{await refresh();policy=await call('policy');const maximum=Number(cap.value);if(!Number.isInteger(maximum)||maximum<job.total-(job.counts?.complete||0))throw Error('남은 대상 수 이상의 명시적 호출 상한을 입력하세요.');if(!confirm(`실제 프롬프트를 확인했으며 GPT-6.1 Sol high, 총 최대 ${maximum}회 API 비용을 승인합니까? 기존 운영 점수는 유지됩니다.`))return;await call('approve',{approval:{granted:true,manifestHash:job.policy.manifestHash,promptHash:policy.promptHash,model:'gpt-6.1-sol',effort:'high',strict_calibration:false,maxCalls:maximum,maxRetries:Number(retries.value)}});await call('run');await refresh();})));
 panel.append(action('승인된 작업 이어하기',run(async()=>{await refresh();if(job.status==='paused')await call('resume');await call('run');await refresh();})));
 panel.append(action('결과·게이트·실패 보기',run(async()=>{const value=await call('results');resultHash=value.resultHash;output.replaceChildren(node('pre',JSON.stringify(value.entries.map(e=>({id:e.id,status:e.state.status,result:e.state.result})),null,2)));})));
 panel.append(action('저장된 원시 판정으로 점수 재계산',run(async()=>{if(!confirm('같은 평가 기준의 저장된 원시 판정으로 점수만 재계산할까요? AI를 호출하지 않으며 결과 검토는 다시 필요합니다.'))return;await call('recalculate');resultHash=null;await refresh();})));
 panel.append(action('전후 분포·전환 표본 보기',run(async()=>{const report=await call('report');output.replaceChildren(node('pre',JSON.stringify(report,null,2)));for(const sample of report.samples){const link=node('a',`원문 확인 ${sample.source?.school||''} ${sample.source?.originalNumber||sample.id}`);link.href='#'+sample.detailRoute;link.target='_blank';link.rel='noopener';output.append(link,node('br'));}})));
 panel.append(action('표본 검토 후 운영 점수 교체',run(async()=>{if(!resultHash)throw Error('결과를 먼저 확인하세요.');await refresh();if(!confirm('티어·승급별 원문 표본 약 20문항과 전체 결과를 검토했고, 수동 점수를 포함한 운영 점수 교체를 승인합니까? 실패 문항은 기존 점수를 유지합니다.'))return;await call('activate',{approval:{granted:true,includeManual:true,sampleReviewed:true,manifestHash:job.policy.manifestHash,resultHash}});await refresh();})));
 panel.append(action('이 작업의 운영 전환 되돌리기',run(async()=>{if(!confirm('이 작업의 v1.2 활성 점수만 해제하고 보존된 이전 점수로 되돌릴까요?'))return;await call('rollback',{approval:{granted:true}});await refresh();})));
}

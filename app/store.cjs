const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { validatePart } = require('./parts.cjs');

const id = () => crypto.randomUUID();
const stamp = () => new Date().toISOString();
const clone = value => JSON.parse(JSON.stringify(value));
const safeId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
const text = (value, max = 100000) => typeof value === 'string' ? value.slice(0, max) : '';

function rebaseProjectAssets(project, folder, externalSource) {
  const assetsDir = path.join(folder, 'assets');
  const realFolder = fs.realpathSync(folder);
  let realAssets;
  try { realAssets = fs.realpathSync(assetsDir); } catch(error) { if(error.code!=='ENOENT')throw error;realAssets=path.join(realFolder,'assets'); }
  if (path.dirname(realAssets) !== realFolder) throw new Error('프로젝트 외부의 assets 폴더에는 연결할 수 없습니다.');
  const missing=new Map();

  const localAsset = storedPath => {
    if (typeof storedPath !== 'string' || !storedPath) throw new Error('프로젝트의 원본 또는 선택 영역 파일 경로가 올바르지 않습니다.');
    // Old projects can contain Windows paths even when opened on another platform.
    const name = path.posix.basename(storedPath.replace(/\\/g, '/'));
    if (!name || name === '.' || name === '..' || /[:\x00]/.test(name)) throw new Error('프로젝트의 이미지 파일 이름이 올바르지 않습니다.');
    const candidate = path.join(assetsDir, name);
    let resolved;
    try {
      resolved = fs.realpathSync(candidate);
      if (!fs.statSync(resolved).isFile()) throw new Error('Not a file');
    } catch(error) { if(error.code!=='ENOENT')throw error;missing.set(name,{name,path:candidate});return candidate; }
    if (path.dirname(resolved) !== realAssets) throw new Error('프로젝트 외부의 원본 또는 선택 영역 파일에는 연결할 수 없습니다.');
    return candidate;
  };

  const external=project.queueSource&&externalSource?.(project.queueSource.queueId,project.id);
  if(project.queueSource&&!external)throw Error('대기열 원본 연결을 확인하세요.');
  project.source.path = external || localAsset(project.source?.path);
  if (project.sources) {
    if (!Array.isArray(project.sources) || !project.sources.length || project.sources[0].id !== 'primary' || new Set(project.sources.map(s=>s.id)).size !== project.sources.length) throw new Error('원본 파일 목록이 올바르지 않습니다.');
    for (const source of project.sources) {
      if (!safeId(source.id)) throw new Error('원본 파일 번호가 올바르지 않습니다.');
      source.path = source.id==='primary'&&external?external:localAsset(source.path);
    }
    project.source.path = project.sources[0].path;
  }
  for (const problem of project.problems || []) problem.cropPaths = (problem.cropPaths || []).map(localAsset);
  const visitFigures=value=>{if(!value||typeof value!=='object')return; if(value.sourceFigure?.path)value.sourceFigure.path=localAsset(value.sourceFigure.path);if(Array.isArray(value.sourceFigures))for(const f of value.sourceFigures)if(f.path)f.path=localAsset(f.path);for(const [key,item] of Object.entries(value))if(key!=='sourceFigure'&&item&&typeof item==='object')visitFigures(item);};visitFigures(project.problems);
  if(missing.size)project.assetIssues=[...missing.values()];else delete project.assetIssues;
  return project;
}

function atomicWrite(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2), 'utf8');
  try {
    for(let attempt=0;;attempt++){
      try{fs.renameSync(temporary,file);break;}
      catch(error){
        if(process.platform!=='win32'||!['EPERM','EACCES','EBUSY'].includes(error.code)||attempt>=4)throw error;
        // Windows scanners can briefly hold the destination. Never delete it to retry.
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,25*2**attempt);
      }
    }
  } catch (error) { try{fs.rmSync(temporary, { force: true });}catch{} throw error; }
}

function normalizeQuestion(value, sourceId, kind = 'variant', previous = null) {
  if (!value || typeof value !== 'object' || !text(value.body).trim()) return null;
  return {
    id: safeId(previous?.id) ? previous.id : (safeId(value.id) ? value.id : id()), kind, sourceId,
    statementBox: Array.isArray(value.statementBox)?value.statementBox.map(x=>text(x,10000)):previous?.statementBox||[],
    layoutDocument: require('./structured-layout.js').validate(clone(value.layoutDocument !== undefined ? value.layoutDocument : value.body===previous?.body ? previous?.layoutDocument||null : null)),
    layoutMode: ['auto','normal','structure'].includes(value.layoutMode)?value.layoutMode:previous?.layoutMode||'auto',
    boxSlot: typeof value.boxSlot==='string'?value.boxSlot:previous?.boxSlot||'after',
    boxSlotManual: value.boxSlotManual??previous?.boxSlotManual??false,
    bodyBorder: typeof value.bodyBorder==='boolean'?value.bodyBorder:previous?.bodyBorder??false,
    body: text(value.body), choices: Array.isArray(value.choices) ? value.choices.slice(0, 20).map(x => text(x, 10000)) : [],
    answer: text(value.answer, 20000), solution: text(value.solution),
    solutionGuide: value.solutionGuide==null?null:(value.solutionGuide.basis?require('./solution-guide.js').validate(value.solutionGuide):require('./solution-guide.js').bind(value.solutionGuide,value)),
    ...((value.originalPoints??previous?.originalPoints)!=null?{originalPoints:clone(value.originalPoints??previous.originalPoints)}:{}),
    diagram: value.diagram && typeof value.diagram === 'object' ? clone(value.diagram) : null,
    include: typeof value.include === 'boolean' ? value.include : previous?.include || false,
    layout: ['auto', 'half', 'full'].includes(value.layout) ? value.layout : previous?.layout || 'auto',
    choiceLayout: ['auto','vertical'].includes(value.choiceLayout)?value.choiceLayout:previous?.choiceLayout||'auto',
    choiceLayoutManual: value.choiceLayoutManual??previous?.choiceLayoutManual??false,
    diagramMode: value.diagramMode||previous?.diagramMode||'redraw',
    sourceFigure: clone(value.sourceFigure||previous?.sourceFigure||null),
    sourceFigures: clone(value.sourceFigures??previous?.sourceFigures??[]),
    hiddenFigureIds: clone(value.hiddenFigureIds??previous?.hiddenFigureIds??[]),
    diagramPosition: ['before','after'].includes(value.diagramPosition) ? value.diagramPosition : previous?.diagramPosition || 'after',
    figurePlacements: clone(value.figurePlacements&&typeof value.figurePlacements==='object'&&!Array.isArray(value.figurePlacements)?value.figurePlacements:previous?.figurePlacements||{}),
    figurePlacementManual: clone(value.figurePlacementManual&&typeof value.figurePlacementManual==='object'&&!Array.isArray(value.figurePlacementManual)?value.figurePlacementManual:previous?.figurePlacementManual||{}),
    needsReview: Boolean(value.needsReview),
  };
}

class ProjectStore {
  constructor(dataDir) {
    this.dataDir = path.resolve(dataDir);
    this.projectsDir = path.join(this.dataDir, 'projects');
    this.indexFile = path.join(this.dataDir, 'index.json');
    this.cache = new Map();
    this.notices=[];
    fs.mkdirSync(this.projectsDir, { recursive: true });
    this.folders=new (require('./project-folders.cjs').ProjectFolders)(this.projectsDir,atomicWrite);
    if(!fs.existsSync(this.indexFile)&&!fs.readdirSync(this.projectsDir).length)atomicWrite(this.indexFile,{lastId:null,recent:[]});
  }
  projectDir(projectId) {
    if (!safeId(projectId)) throw new Error('올바르지 않은 프로젝트 번호입니다.');
    return this.folders.resolve(projectId);
  }
  projectEntries(){return this.folders.entries();}
  reserveProjectFolder(project){return this.folders.reserve(project);}
  migrateProjectFolders(){const result=this.folders.migrate();this.cache.clear();for(const s of result.skipped)this.notices.push('프로젝트 폴더 이름 변경 보류: '+s.id+' · '+s.reason);return result;}
  readIndex() {
    let raw;
    try {
      raw=fs.readFileSync(this.indexFile,'utf8');const index=JSON.parse(raw);
      if(!index||!Array.isArray(index.recent)||index.recent.some(p=>!safeId(p.id))||(index.lastId!==null&&!safeId(index.lastId)))throw Error('작업 목록 형식 오류');
      return index;
    } catch(error) {
      if(raw===undefined&&error.code!=='ENOENT')throw error;
      return this.recoverIndex(raw);
    }
  }
  recoverIndex(raw) {
    const recent=[],failures=[];
    const entries=this.projectEntries();
    for(const {project:p}of entries)recent.push({id:p.id,title:text(p.title,200)||'복구된 작업',updatedAt:p.updatedAt||p.createdAt||''});
    for(const e of fs.readdirSync(this.projectsDir,{withFileTypes:true}))if(e.isDirectory()&&!entries.some(x=>x.name===e.name))failures.push(e.name);
    recent.sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)));
    const index={lastId:null,recent};
    if(raw!==undefined)fs.writeFileSync(path.join(this.dataDir,`index.corrupt-${Date.now()}-${id()}.json`),raw,{flag:'wx'});
    if(raw!==undefined||recent.length||failures.length){atomicWrite(this.indexFile,index);this.notices.push(`작업 목록을 복구했습니다: ${recent.length}개. 원본 작업은 삭제하지 않았습니다.${failures.length?' 읽지 못한 작업 '+failures.length+'개는 데이터 관리에서 확인하세요.':''}`);}
    return index;
  }
  takeNotices(){return this.notices.splice(0);}
  remember(projectId,project){this.cache.delete(projectId);this.cache.set(projectId,project);while(this.cache.size>12)this.cache.delete(this.cache.keys().next().value);}
  list() { return this.readIndex().recent || []; }
  closeCurrent() {
    const index = this.readIndex();
    index.lastId = null;
    atomicWrite(this.indexFile,index);
  }
  last() { const key = this.readIndex().lastId; if (!key) return null; try { return this.get(key); } catch(error) { this.notices.push('이전 작업을 열지 못했습니다. 데이터는 보존했습니다. '+error.message);return null; } }
  get(projectId) {
    const folder = this.projectDir(projectId);
    const file = path.join(folder, 'project.json');
    if (!this.cache.has(projectId)) {
      const loaded = this.folders.rebase(JSON.parse(fs.readFileSync(file, 'utf8')));
      this.remember(projectId, rebaseProjectAssets(loaded, folder, this.externalSource));
    }
    this.remember(projectId,this.cache.get(projectId));
    return clone(this.cache.get(projectId));
  }
  save(project) {
    const folder = this.projectDir(project.id);
    if (!Array.isArray(project.problems)) throw new Error('문제 목록 형식이 올바르지 않습니다.');
    const saved = clone(project);
    saved.title = text(saved.title, 200) || '새 문제집';
    saved.version = 1;
    saved.updatedAt = stamp();
    saved.settings = { ...(saved.settings?.paperForm?{paperForm:structuredClone(saved.settings.paperForm)}:{}), ...require('./document-style.cjs').documentStyle(saved.settings), paper: 'A4', showQuestionLabels:saved.settings?.showQuestionLabels!==false, layout: ['auto','4','2'].includes(saved.settings?.layout) ? saved.settings.layout : 'auto', workspaceLines: Math.min(12, Math.max(0, Number(saved.settings?.workspaceLines ?? 2) || 0)) };
    const old = this.cache.get(project.id);
    if (old) {
      // The renderer can edit content, never replace the stored source path or asset ownership.
      saved.source = old.source;
      if (old.sources) saved.sources = old.sources; else delete saved.sources;
      for (const problem of saved.problems) {
        if (problem.part !== undefined) validatePart(problem.part);
        const existing = old.problems.find(p => p.id === problem.id);
        if (!existing) throw new Error('영역 추가 기능으로 문제를 추가해 주세요.');
        problem.cropPaths = existing.cropPaths;
        problem.regions = existing.regions;
        problem.threadId = existing.threadId;
        problem.geminiThreadId = existing.geminiThreadId;
        problem.lastProvider = existing.lastProvider;
        problem.messages = existing.messages;
      }
    }
    return this.write(saved, folder);
  }
  write(project, folder = this.projectDir(project.id)) {
    const previous=this.cache.get(project.id);
    if(previous?.createdAt)project.createdAt=previous.createdAt;
    project.updatedAt = stamp();
    atomicWrite(path.join(folder, 'project.json'), project);
    this.remember(project.id, clone(project));
    const index = this.readIndex();
    index.lastId = project.id;
    index.recent = [{ id: project.id, title: project.title, updatedAt: project.updatedAt }, ...(index.recent || []).filter(p => p.id !== project.id)].slice(0, 30);
    atomicWrite(this.indexFile, index);
    // Optional observer runs after local persistence. Cloud failure must never block local editing.
    try{this.onWrite?.(clone(project),previous?clone(previous):null);}catch(error){console.warn('문제은행 등록 알림 실패:',error.message);}
    return clone(project);
  }
  validateSources(paths) {
    if (!Array.isArray(paths) || !paths.length) throw new Error('PDF 또는 이미지 파일을 선택해 주세요.');
    for (const file of paths) {
      if (typeof file !== 'string' || !path.isAbsolute(file) || !['.pdf','.png','.jpg','.jpeg','.webp','.bmp'].includes(path.extname(file).toLowerCase())) throw new Error('PDF 또는 이미지 파일을 선택해 주세요.');
      const stat = fs.statSync(file);
      if (!stat.isFile() || !stat.size || stat.size > 300*1024*1024) throw new Error('내용이 있는 300MB 이하의 PDF 또는 이미지 파일을 선택해 주세요.');
    }
  }
  copySources(paths, folder, first = false) {
    this.validateSources(paths);
    const sources = [];
    try {
      for (const [index,file] of paths.entries()) {
        const ext = path.extname(file).toLowerCase(), sourceId = first && index === 0 ? 'primary' : id();
        const target = path.join(folder,'assets',sourceId === 'primary' ? `source${ext}` : `source-${sourceId}${ext}`);
        fs.copyFileSync(file,target,fs.constants.COPYFILE_EXCL);
        sources.push({id:sourceId,name:path.basename(file),type:ext === '.pdf'?'pdf':'image',path:target});
      }
      return sources;
    } catch (error) { for (const source of sources) fs.unlinkSync(source.path); throw error; }
  }
  closeSource({projectId,sourceId,removeProblems=false}) {
    const project=this.get(projectId),sources=project.sources||[{...project.source,id:'primary'}];
    if(!sources.some(s=>s.id===sourceId))throw Error('닫을 원본 파일을 찾을 수 없습니다.');
    if(sources.length===1){this.closeCurrent();return {project:null,removedProblemIds:[],promotedSourceId:null};}
    const affected=project.problems.filter(p=>p.regions.some(r=>(r.sourceId||'primary')===sourceId));
    if(affected.length&&!removeProblems)throw Error('이 원본에 연결된 문제를 함께 제거할지 확인해 주세요.');
    const removedProblemIds=affected.map(p=>p.id);
    project.problems=project.problems.filter(p=>!removedProblemIds.includes(p.id));
    project.sources=sources.filter(s=>s.id!==sourceId);
    let promotedSourceId=null;
    if(sourceId==='primary'){
      promotedSourceId=project.sources[0].id;project.sources[0].id='primary';
      for(const p of project.problems)for(const r of p.regions)if(r.sourceId===promotedSourceId)r.sourceId='primary';
      const {id:sourceKey,...source}=project.sources[0];project.source=source;
    }
    // Detach from the work document only. Original files and capture assets stay on disk.
    return {project:this.write(project),removedProblemIds,promotedSourceId};
  }
  addSources(projectId, paths) {
    const project = this.get(projectId);
    const additions = this.copySources(paths,this.projectDir(projectId));
    project.sources = [...(project.sources || [{...project.source,id:'primary'}]),...additions];
    // Appending files never changes existing regions, recognition or review state.
    return this.write(project);
  }
  create(input) {
    const paths = Array.isArray(input) ? input : [input];
    this.validateSources(paths);
    const sourcePath = paths[0], ext = path.extname(sourcePath).toLowerCase();
    const projectId = id();
    const createdAt=stamp(),title=path.basename(sourcePath,ext);
    const folder = this.reserveProjectFolder({id:projectId,title,createdAt});
    fs.mkdirSync(path.join(folder,'assets'), { recursive: true });
    const sources = this.copySources(paths,folder,true);
    const {id:primaryId,...source} = sources[0];
    const project = { version:1, id:projectId, title, createdAt, updatedAt:stamp(), source, ...(sources.length>1?{sources}:{}), settings:{paper:'A4',layout:'auto',workspaceLines:2},problems:[] };
    return this.write(project);
  }
  createExternal(file,queueId) {
    this.validateSources([file]);
    const projectId=id(),createdAt=stamp(),ext=path.extname(file).toLowerCase(),title=path.basename(file,ext);
    const folder=this.reserveProjectFolder({id:projectId,title,createdAt});fs.mkdirSync(path.join(folder,'assets'),{recursive:true});
    return this.write({version:1,id:projectId,title,createdAt,updatedAt:createdAt,queueSource:{queueId},source:{queueSourceId:queueId,name:path.basename(file),path:path.resolve(file),type:ext==='.pdf'?'pdf':'image'},settings:{paper:'A4',layout:'auto',workspaceLines:2},problems:[]},folder);
  }
  relocateExternal(projectId,queueId,file) {
    const project=this.get(projectId);if(project.queueSource?.queueId!==queueId)throw Error('대기열 원본 연결이 다릅니다.');
    project.source.path=file;if(project.sources)project.sources[0].path=file;return this.write(project);
  }
  importProject(file) {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (parsed.version !== 1 || !safeId(parsed.id) || !Array.isArray(parsed.problems)) throw new Error('이 앱의 project.json 파일을 선택해 주세요.');
    const ownFile = path.join(this.projectDir(parsed.id), 'project.json');
    if (path.resolve(file) !== path.resolve(ownFile)) throw new Error('프로젝트는 데이터 폴더의 프로젝트 목록에서 열어 주세요. 다른 PC에서 가져올 때는 프로젝트 폴더 전체를 data/projects에 복사할 수 있습니다.');
    this.cache.delete(parsed.id);
    return this.write(this.get(parsed.id));
  }
  addRegion({projectId,problemId,region,imageDataUrl,part='',queueDetection}) {
    validatePart(part);
    const project = this.get(projectId);
    if (!region || !Number.isInteger(region.page) || region.page < 1) throw new Error('선택한 페이지가 올바르지 않습니다.');
    const sourceId = region.sourceId || 'primary';
    if (!(project.sources || [{id:'primary'}]).some(source=>source.id===sourceId)) throw new Error('선택한 원본 파일을 찾을 수 없습니다.');
    for (const key of ['x','y','width','height']) if (!Number.isFinite(region[key])) throw new Error('선택 영역이 올바르지 않습니다.');
    if (region.x < 0 || region.y < 0 || region.width <= 0 || region.height <= 0 || region.x+region.width > 1.001 || region.y+region.height > 1.001) throw new Error('영역을 페이지 안에 지정해 주세요.');
    const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(imageDataUrl || '');
    if (!match || match[1].length > 60*1024*1024) throw new Error('선택 영역 이미지가 올바르지 않거나 너무 큽니다.');
    const bytes = Buffer.from(match[1],'base64');
    if (!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw new Error('PNG 이미지가 필요합니다.');
    let problem;
    if (problemId) { problem=project.problems.find(p=>p.id===problemId); if (!problem) throw new Error('추가할 문제를 찾을 수 없습니다.'); }
    else { problem={id:id(),label:`문제 ${project.problems.length+1}`,part,regions:[],cropPaths:[],threadId:null,messages:[],original:null,variants:[],warnings:[],needsReview:false}; project.problems.push(problem); }
    const imagePath=path.join(this.projectDir(projectId),'assets',`${problem.id}-${id()}.png`);
    fs.writeFileSync(imagePath,bytes);
    problem.regions.push({...clone(region),sourceId}); problem.cropPaths.push(imagePath);
    if(project.queueSource&&queueDetection?.key){problem.queueDetectionKeys=[...new Set([...(problem.queueDetectionKeys||[]),queueDetection.key])];if(queueDetection.group)problem.queueGroup=queueDetection.group;if(queueDetection.issue)problem.queueRegionIssue=queueDetection.issue;}
    if (problem.recognition) { problem.recognition.confirmed=false;problem.recognition.cacheKey=null;problem.recognition.sourceStale=true;for(const q of [problem.original,...problem.variants].filter(Boolean)){q.needsReview=true;q.approval={status:'pending',reason:'원본 영역 변경'};} }
    if (problem.original) { problem.needsReview=true; problem.warnings=['원본 영역이 추가되었습니다. 다시 인식하거나 대화로 확인해 주세요.']; }
    return this.write(project);
  }
  updateProblem(projectId, problemId, updater) {
    const project=this.get(projectId); const problem=project.problems.find(p=>p.id===problemId);
    if (!problem) throw new Error('문제를 찾을 수 없습니다.');
    updater(problem,project); return this.write(project);
  }
  replaceRegion({projectId,problemId,regionIndex,region,imageDataUrl}) {
    const existing=this.get(projectId).problems.find(p=>p.id===problemId);
    if(!existing||!Number.isInteger(regionIndex)||regionIndex<0||regionIndex>=existing.regions.length)throw new Error('다시 지정할 영역을 찾을 수 없습니다.');
    // Reuse validated capture, then replace the requested region with the new asset.
    const project=this.addRegion({projectId,problemId,region,imageDataUrl});
    const p=project.problems.find(x=>x.id===problemId);
    p.regions[regionIndex]=p.regions.pop();p.cropPaths[regionIndex]=p.cropPaths.pop();
    if(p.recognition||p.original){p.needsReview=true;if(p.original)p.original.needsReview=true;for(const q of p.variants)q.needsReview=true;
    p.warnings=['원본 영역을 수정했습니다. 다시 인식한 후 문제와 해설을 검토해 주세요.'];}
    return this.write(project);
  }
  removeRegion({projectId,problemId,regionIndex}) {
    const project=this.get(projectId);const p=project.problems.find(x=>x.id===problemId);
    if(!p||!Number.isInteger(regionIndex)||regionIndex<0||regionIndex>=p.regions.length)throw new Error('삭제할 영역을 찾을 수 없습니다.');
    if(p.regions.length===1)return this.removeProblem(projectId,problemId);
    p.regions.splice(regionIndex,1);p.cropPaths.splice(regionIndex,1);
    if(p.recognition){p.recognition.confirmed=false;p.recognition.cacheKey=null;p.recognition.sourceStale=true;}
    for(const q of [p.original,...p.variants].filter(Boolean))q.approval={status:'pending',reason:'원본 영역 변경'};
    p.needsReview=true;if(p.original)p.original.needsReview=true;for(const q of p.variants)q.needsReview=true;
    p.warnings=['원본 영역이 삭제되었습니다. 남은 영역으로 다시 인식해 주세요.'];return this.write(project);
  }
  removeProblem(projectId,problemId) { const p=this.get(projectId); p.problems=p.problems.filter(x=>x.id!==problemId); return this.write(p); }
  ownsAsset(assetPath) {
    if(this.ownsExternal?.(assetPath))return true;
    if (typeof assetPath !== 'string') return false;
    try {
      const resolved=fs.realpathSync(assetPath); const rel=path.relative(fs.realpathSync(this.projectsDir),resolved);
      return rel && !rel.startsWith('..') && !path.isAbsolute(rel) && /\.(pdf|png|jpe?g|webp|bmp|svg)$/i.test(resolved);
    } catch { return false; }
  }
}
module.exports={ProjectStore,normalizeQuestion,atomicWrite,id,stamp};

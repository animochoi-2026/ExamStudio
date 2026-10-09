const {contextBridge,ipcRenderer,webUtils}=require('electron');
const invoke=channel=>(...args)=>ipcRenderer.invoke(`exam:${channel}`,...args);
contextBridge.exposeInMainWorld('exam',{
  examQueueRepairMetadata:invoke('examQueueRepairMetadata'),examQueueRetryUpload:invoke('examQueueRetryUpload'),examQueueConfirmRegion:invoke('examQueueConfirmRegion'),examQueueStatus:invoke('examQueueStatus'),examQueueAdd:invoke('examQueueAdd'),examQueueEdit:invoke('examQueueEdit'),examQueueAction:invoke('examQueueAction'),examQueueNext:invoke('examQueueNext'),examQueuePrepare:invoke('examQueuePrepare'),examQueueDiscovery:invoke('examQueueDiscovery'),examQueueRegions:invoke('examQueueRegions'),examQueueCapture:invoke('examQueueCapture'),examQueueStep:invoke('examQueueStep'),examQueueFinish:invoke('examQueueFinish'),examQueueMove:invoke('examQueueMove'),
  examQueueDrop:files=>ipcRenderer.invoke('exam:examQueueAdd',Array.from(files).map(file=>webUtils.getPathForFile(file))),
  bankMaintenanceCandidates:invoke('bankMaintenanceCandidates'),bankMaintenanceStatus:invoke('bankMaintenanceStatus'),bankMaintenancePlan:invoke('bankMaintenancePlan'),bankMaintenanceSample:invoke('bankMaintenanceSample'),bankMaintenanceStart:invoke('bankMaintenanceStart'),bankMaintenancePause:invoke('bankMaintenancePause'),bankMaintenanceUndo:invoke('bankMaintenanceUndo'),bankMaintenancePreview:invoke('bankMaintenancePreview'),
  bankAnalysisComparisonPlan:invoke('bankAnalysisComparisonPlan'),bankAnalyze:invoke('bankAnalyze'),bankImportExam:invoke('bankImportExam'),bankSearch:invoke('bankSearch'),bankCatalog:invoke('bankCatalog'),bankRevisionStatus:invoke('bankRevisionStatus'),bankReviewSave:invoke('bankReviewSave'),bankRateSave:invoke('bankRateSave'),bankReview:invoke('bankReview'),bankPropose:invoke('bankPropose'),bankRole:invoke('bankRole'),bankUsage:invoke('bankUsage'),bankReindex:invoke('bankReindex'),bankPreview:invoke('bankPreview'),bankImportSelection:invoke('bankImportSelection'),bankBackup:invoke('bankBackup'),bankRestoreBackup:invoke('bankRestoreBackup'),bankMembers:invoke('bankMembers'),bankInvite:invoke('bankInvite'),bankExportConfig:invoke('bankExportConfig'),bankAttach:invoke('bankAttach'),bankStatus:invoke('bankStatus'),bankConfigure:invoke('bankConfigure'),bankConnect:invoke('bankConnect'),bankCancelConnect:invoke('bankCancelConnect'),bankDisconnect:invoke('bankDisconnect'),bankRoot:invoke('bankRoot'),bankAuto:invoke('bankAuto'),bankTargets:invoke('bankTargets'),bankSave:invoke('bankSave'),bankEdit:invoke('bankEdit'),bankSource:invoke('bankSource'),bankRefresh:invoke('bankRefresh'),bankRetry:invoke('bankRetry'),bankRetryTimedOut:invoke('bankRetryTimedOut'),bankPause:invoke('bankPause'),bankRestore:invoke('bankRestore'),bankOpenFolder:invoke('bankOpenFolder'),
  detectRegions:invoke('detectRegions'),
  closeSource:invoke('closeSource'),
  checkUpdate:invoke('checkUpdate'),downloadUpdate:invoke('downloadUpdate'),installUpdate:invoke('installUpdate'),openUpdatePage:invoke('openUpdatePage'),
  maintenanceInfo:invoke('maintenanceInfo'),maintainProject:invoke('maintainProject'),
  readSourceFigure:invoke('readSourceFigure'),setPresentation:invoke('setPresentation'),
  readMaterials:invoke('readMaterials'),ensureInputFocus:invoke('ensureInputFocus'),includeWithoutSolution:invoke('includeWithoutSolution'),
  finalizeAutomatic:invoke('finalizeAutomatic'),dismissQuestionIssues:invoke('dismissQuestionIssues'),readErrors:invoke('readErrors'),recordError:invoke('recordError'),removeErrors:invoke('removeErrors'),resolveSourceIssues:invoke('resolveSourceIssues'),ignoreSourceIssues:invoke('ignoreSourceIssues'),
  boot:invoke('boot'),resetWorkspace:invoke('resetWorkspace'),importSource:invoke('importSource'),openProject:invoke('openProject'),saveProject:invoke('saveProject'),
  importDroppedFiles:(files,projectId)=>{
    const paths=Array.from(files).map(file=>webUtils.getPathForFile(file));
    if(!paths.length||paths.some(file=>!file))return Promise.reject(new Error('컴퓨터에 저장된 시험지 파일을 놓아 주세요.'));
    return ipcRenderer.invoke('exam:importDroppedSource',paths,projectId);
  },
  importDroppedFile:file=>{
    let filePath;try{filePath=webUtils.getPathForFile(file);}catch{return Promise.reject(new Error('컴퓨터에 저장된 시험지 파일을 놓아 주세요.'));}
    if(!filePath)return Promise.reject(new Error('컴퓨터에 저장된 시험지 파일을 놓아 주세요.'));
    return ipcRenderer.invoke('exam:importDroppedSource',filePath);
  },
  saveAiSettings:invoke('saveAiSettings'),accountAction:invoke('accountAction'),
  saveGeminiAccess:invoke('saveGeminiAccess'),
  getRulesSettings:invoke('getRulesSettings'),saveRule:invoke('saveRule'),saveScope:invoke('saveScope'),scopePreset:invoke('scopePreset'),previewTask:invoke('previewTask'),confirmSource:invoke('confirmSource'),approveQuestion:invoke('approveQuestion'),editQuestion:invoke('editQuestion'),deleteVariant:invoke('deleteVariant'),
  setProblemPart:invoke('setProblemPart'),
  claudeAccount:invoke('claudeAccount'),saveClaudeSettings:invoke('saveClaudeSettings'),geminiAccount:invoke('geminiAccount'),saveGeminiSettings:invoke('saveGeminiSettings'),openGeminiGuide:invoke('openGeminiGuide'),classifyProblem:invoke('classifyProblem'),
  readAsset:invoke('readAsset'),addRegion:invoke('addRegion'),replaceRegion:invoke('replaceRegion'),removeRegion:invoke('removeRegion'),removeProblem:invoke('removeProblem'),chat:invoke('chat'),
  cancelChat:invoke('cancelChat'),account:invoke('account'),login:invoke('login'),exportDocument:invoke('exportDocument'),
  previewDocument:invoke('previewDocument'),openPath:invoke('openPath'),
  onEvent:callback=>{const listener=(_event,payload)=>callback(payload);ipcRenderer.on('exam:event',listener);return()=>ipcRenderer.removeListener('exam:event',listener);}
});

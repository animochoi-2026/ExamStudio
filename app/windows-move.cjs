'use strict';
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const codes = {2:'ENOENT',3:'ENOENT',5:'EACCES',17:'EXDEV',32:'EBUSY',80:'EEXIST',112:'ENOSPC',183:'EEXIST'};
const uncertain = new Set([53,64,67,121,1117,1167,1231,1232,1460]);

function moveNoReplace(source, destination, {expectedHash, execute = execFileSync} = {}) {
  if (process.platform !== 'win32') throw Object.assign(Error('Windows 원본 이동 API가 필요합니다.'), {code:'ENOTSUP',dispatched:false});
  if (![source,destination].every(p=>typeof p==='string'&&path.isAbsolute(p)&&!p.includes('\0')) || source===destination || !/^[a-f0-9]{64}$/.test(expectedHash||'')) {
    throw Object.assign(Error('원본 이동 경로와 내용 해시를 확인하세요.'), {code:'EINVAL',dispatched:false});
  }
  let packet;
  try {
    const executable = path.join(process.env.SystemRoot || 'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
    const output = execute(executable, ['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'windows-move.ps1'),'-Source',source,'-Destination',destination,'-ExpectedHash',expectedHash], {encoding:'utf8',windowsHide:true,timeout:20000,maxBuffer:65536});
    packet = JSON.parse(output.trim().replace(/^\uFEFF/,''));
  } catch (error) {
    // A timeout or missing reply can occur after the filesystem already applied the rename.
    throw Object.assign(Error('원본 이동 응답을 확인하지 못했습니다: '+error.message), {code:error.code||'move_response_unknown',dispatched:error.code!=='ENOENT',moveResultUnknown:error.code!=='ENOENT'});
  }
  if (packet.ok===true && packet.operation==='MoveFileExW' && packet.flags===0) return packet;
  if (packet.setupError) throw Object.assign(Error('원본 이동 준비 실패: '+packet.message), {code:'move_setup',dispatched:false});
  if (packet.hashMismatch) throw Object.assign(Error('선택 이후 원본 내용이 바뀌었습니다. 이동을 보류합니다.'), {code:'source_changed',dispatched:false});
  const win32Code = Number(packet.win32Code);
  if (!Number.isInteger(win32Code)||win32Code<=0||packet.operation!=='MoveFileExW'||packet.flags!==0) throw Object.assign(Error('원본 이동 응답 형식 확인 필요'),{code:'move_response_unknown',dispatched:true,moveResultUnknown:true});
  throw Object.assign(Error('원본 이동 실패 (Windows '+win32Code+'): '+(packet.message||'파일·권한·장치 연결을 확인하세요.')), {code:codes[win32Code]||'win32_move',win32Code,dispatched:true,moveResultUnknown:uncertain.has(win32Code)});
}
module.exports = {moveNoReplace};

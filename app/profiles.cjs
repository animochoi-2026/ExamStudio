'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { atomicWrite } = require('./store.cjs');
const { PromptStore, DEFAULT_PROMPTS, validatePrompts } = require('./prompts.cjs');
const clone = value => JSON.parse(JSON.stringify(value));
class ProfileStore {
  constructor(directory) { this.base = new PromptStore(directory); this.file = path.join(directory, 'prompt-profiles.json'); }
  load() {
    try {
      const data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (!Array.isArray(data.profiles) || data.profiles.length > 50 || typeof data.activeId !== 'string') throw new Error();
      const ids = new Set(), names = new Set();
      for (const p of data.profiles) {
        if (!p || typeof p.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(p.id) || ids.has(p.id)) throw new Error();
        p.name = this.name(p.name); if (names.has(p.name)) throw new Error();
        ids.add(p.id); names.add(p.name); p.prompts = validatePrompts(p.prompts);
      }
      if (data.activeId && !ids.has(data.activeId)) throw new Error();
      if (data.autoClassify !== undefined && typeof data.autoClassify !== 'boolean') throw new Error();
      return data;
    } catch (error) {
      if (error.code === 'ENOENT') return { activeId: '', profiles: [] };
      throw new Error('시험범위 설정 파일을 읽지 못했습니다. prompt-profiles.json을 확인해 주세요. 기존 파일은 보존됩니다.');
    }
  }
  name(value) { if (typeof value !== 'string' || !value.trim() || value.trim().length > 60) throw new Error('시험범위 이름을 1~60자로 입력해 주세요.'); return value.trim(); }
  read() { const data = this.load(); return data.activeId ? clone(data.profiles.find(p => p.id === data.activeId).prompts) : this.base.read(); }
  snapshot() {
    try { const data = this.load(); return { values: this.read(), defaults: clone(DEFAULT_PROMPTS), error: '', activeId: data.activeId, activeName: data.profiles.find(p => p.id === data.activeId)?.name || '공통 설정', profiles: data.profiles.map(({id,name}) => ({id,name})), autoClassify: data.autoClassify !== false }; }
    catch (error) { return { values: clone(DEFAULT_PROMPTS), defaults: clone(DEFAULT_PROMPTS), error: error.message, activeId: '', activeName: '설정 확인 필요', profiles: [] }; }
  }
  save(value) {
    const prompts = validatePrompts(value), data = this.load();
    if (!data.activeId) return this.base.save(prompts);
    data.profiles.find(p => p.id === data.activeId).prompts = prompts; atomicWrite(this.file, data); return clone(prompts);
  }
  change({action,id,name,enabled}) {
    const data = this.load(), existing = data.profiles.find(p => p.id === id);
    if (action === 'create' || action === 'rename') { name = this.name(name); if (data.profiles.some(p => p.name === name && p.id !== (action === 'rename' ? id : null))) throw new Error('같은 이름의 시험범위가 있습니다.'); }
    if (action === 'automatic') {
      if (typeof enabled !== 'boolean') throw new Error('자동 분류 설정이 올바르지 않습니다.'); data.autoClassify = enabled;
    } else if (action === 'create') {
      if (data.profiles.length >= 50) throw new Error('시험범위는 최대 50개까지 저장할 수 있습니다.');
      const profile = { id: randomUUID(), name, prompts: this.read() }; data.profiles.push(profile); data.activeId = profile.id;
    } else if (action === 'select') {
      if (id !== '' && !existing) throw new Error('선택한 시험범위를 찾을 수 없습니다.'); data.activeId = id;
    } else if (action === 'rename' || action === 'delete') {
      if (!existing) throw new Error('먼저 저장한 시험범위를 선택해 주세요.');
      if (action === 'rename') existing.name = name;
      else { data.profiles = data.profiles.filter(p => p.id !== id); if (data.activeId === id) data.activeId = ''; }
    } else throw new Error('지원하지 않는 시험범위 작업입니다.');
    atomicWrite(this.file, data); return this.snapshot();
  }
}
module.exports = { ProfileStore };

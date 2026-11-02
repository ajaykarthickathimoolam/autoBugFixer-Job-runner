import { AsyncLocalStorage } from 'node:async_hooks';

export const jobContext = new AsyncLocalStorage();

export function newActivity() {
  return {
    provider: null,
    filesRead: new Set(),
    filesChanged: new Set(),
    commands: [],
    testsNotRun: null,
    promptTokens: 0,
    completionTokens: 0,
  };
}

export function currentJob() {
  return jobContext.getStore() || null;
}

export function noteProvider(provider) {
  const store = currentJob();
  if (store) store.activity.provider = provider;
}

export function noteFileRead(rel) {
  const store = currentJob();
  if (!store || !rel) return;
  if (store.activity.filesRead.size < 100) store.activity.filesRead.add(String(rel));
}

export function noteFileChanged(rel) {
  const store = currentJob();
  if (!store || !rel) return;
  if (store.activity.filesChanged.size < 100) store.activity.filesChanged.add(String(rel));
}

export function noteCommand(command, code) {
  const store = currentJob();
  if (!store || store.activity.commands.length >= 40) return;
  const text = String(command || '').replace(/\s+/g, ' ').trim().slice(0, 180);
  store.activity.commands.push(`${text} → exit ${code}`);
}

export function addTokens(prompt, completion) {
  const store = currentJob();
  if (!store) return;
  store.activity.promptTokens += Number(prompt) || 0;
  store.activity.completionTokens += Number(completion) || 0;
}

export function setTestsNotRun(value) {
  const store = currentJob();
  if (store) store.activity.testsNotRun = value;
}

export function activitySnapshot() {
  const store = currentJob();
  if (!store) return {};
  const activity = store.activity;
  const snap = {};
  if (activity.provider) snap.llmProvider = activity.provider;
  if (activity.filesRead.size) snap.filesRead = [...activity.filesRead];
  if (activity.filesChanged.size) snap.filesChanged = [...activity.filesChanged];
  if (activity.commands.length) snap.commandsRun = [...activity.commands];
  if (activity.testsNotRun !== null && activity.testsNotRun !== undefined) {
    snap.testsNotRun = activity.testsNotRun;
  }
  if (activity.promptTokens) snap.promptTokens = activity.promptTokens;
  if (activity.completionTokens) snap.completionTokens = activity.completionTokens;
  return snap;
}

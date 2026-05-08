export const storageConfig = {
  // 历史名必须保留：改掉会让旧 IndexedDB 数据不可见。
  databaseName: 'yuri-nest',
  storeName: 'app',
  stateKey: 'state',
  backupKeyPrefix: 'backup:',
  maxLocalBackups: 12,
  accountSessionStorageKey: 'yuri-chat-session-token',
  legacyLocalClaimStorageKey: 'yuri-chat-legacy-local-claimed-account',
  // 历史 key 必须保留：旧云端口令仍可作为短期兼容入口。
  cloudTokenStorageKey: 'yuri-nest-cloud-token',
}

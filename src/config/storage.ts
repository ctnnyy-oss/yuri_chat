export const storageConfig = {
  // 历史名必须保留：改掉会让旧 IndexedDB 数据不可见。
  databaseName: 'yuri-nest',
  storeName: 'app',
  stateKey: 'state',
  backupKeyPrefix: 'backup:',
  maxLocalBackups: 12,
  accountSessionStorageKey: 'yuri_chat-session-token',
  legacyAccountSessionStorageKeys: ['yuri-chat-session-token'],
  legacyLocalClaimStorageKey: 'yuri_chat-legacy-local-claimed-account',
  legacyLocalClaimStorageKeys: ['yuri-chat-legacy-local-claimed-account'],
  cloudTokenStorageKey: 'yuri_chat-cloud-token',
  // 历史 key 必须保留：旧云端口令仍可作为短期兼容入口。
  legacyCloudTokenStorageKeys: ['yuri-nest-cloud-token', 'yuri-chat-cloud-token'],
}

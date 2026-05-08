export const storageConfig = {
  // 历史名必须保留：改掉会让旧 IndexedDB 库不可见，等于把妹妹本机聊天/记忆/角色“藏起来”。
  databaseName: 'yuri-nest',
  storeName: 'app',
  stateKey: 'state',
  backupKeyPrefix: 'backup:',
  maxLocalBackups: 12,
  // 历史 key 必须保留：改掉会让已保存的云端口令不可见，需要妹妹重新找口令。
  cloudTokenStorageKey: 'yuri-nest-cloud-token',
}

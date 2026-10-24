import type { SessionEvent } from '../domain/events';

/**
 * IndexedDB 存储层。
 *
 * 两张表：
 *   kv      —— 工作区元数据（委员会、场次列表、设置），单条记录
 *   events  —— 事件流，复合主键 [sessionId, seq]，天然按场次分区且有序
 *
 * 为什么用复合键而不是自增 id：撤销 = 按 seq 降序删尾部，
 * 场次隔离由键范围保证，不需要额外索引。
 */

const DB_NAME = 'mun-chair';
const DB_VERSION = 1;
const STORE_KV = 'kv';
const STORE_EVENTS = 'events';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_KV)) db.createObjectStore(STORE_KV);
      if (!db.objectStoreNames.contains(STORE_EVENTS)) {
        db.createObjectStore(STORE_EVENTS, { keyPath: ['sessionId', 'seq'] });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

/* ---------------- KV ---------------- */

export function kvGet<T>(key: string): Promise<T | undefined> {
  return tx<T | undefined>(STORE_KV, 'readonly', (s) => s.get(key) as IDBRequest<T | undefined>);
}

export function kvSet<T>(key: string, value: T): Promise<IDBValidKey> {
  return tx<IDBValidKey>(STORE_KV, 'readwrite', (s) => s.put(value, key));
}

/* ---------------- 事件流 ---------------- */

function sessionRange(sessionId: string): IDBKeyRange {
  return IDBKeyRange.bound([sessionId, 0], [sessionId, Number.MAX_SAFE_INTEGER]);
}

export function loadEvents(sessionId: string): Promise<SessionEvent[]> {
  return tx<SessionEvent[]>(STORE_EVENTS, 'readonly', (s) =>
    s.getAll(sessionRange(sessionId)) as IDBRequest<SessionEvent[]>,
  );
}

export function loadAllEvents(): Promise<SessionEvent[]> {
  return tx<SessionEvent[]>(STORE_EVENTS, 'readonly', (s) => s.getAll() as IDBRequest<SessionEvent[]>);
}

export function putEvents(events: SessionEvent[]): Promise<IDBValidKey[]> {
  if (events.length === 0) return Promise.resolve([]);
  return openDb().then(
    (db) =>
      new Promise<IDBValidKey[]>((resolve, reject) => {
        const t = db.transaction(STORE_EVENTS, 'readwrite');
        const store = t.objectStore(STORE_EVENTS);
        const keys: IDBValidKey[] = [];
        for (const ev of events) {
          const req = store.put(ev);
          req.onsuccess = () => keys.push(req.result);
        }
        t.oncomplete = () => resolve(keys);
        t.onerror = () => reject(t.error);
      }),
  );
}

/** 撤销实现：从尾部删掉 count 条事件，后续状态由回放自然得到 */
export function deleteLastEvents(sessionId: string, count: number): Promise<void> {
  if (count <= 0) return Promise.resolve();
  return openDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const t = db.transaction(STORE_EVENTS, 'readwrite');
        const store = t.objectStore(STORE_EVENTS);
        const req = store.getAllKeys(sessionRange(sessionId));
        req.onsuccess = () => {
          const keys = req.result as IDBValidKey[];
          const tail = keys.slice(Math.max(0, keys.length - count));
          for (const k of tail) store.delete(k);
        };
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
      }),
  );
}

export function clearAll(): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const t = db.transaction([STORE_KV, STORE_EVENTS], 'readwrite');
        t.objectStore(STORE_KV).clear();
        t.objectStore(STORE_EVENTS).clear();
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
      }),
  );
}

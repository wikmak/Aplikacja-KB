/* Prosta warstwa nad IndexedDB. Wszystkie dane zostają na urządzeniu. */
const DB = (() => {
  const NAME = 'kierownik-budowy';
  const VERSION = 2;
  const STORES = ['projects', 'logs', 'tasks', 'defects', 'deliveries', 'attendance', 'contacts', 'notes', 'observations', 'photos'];
  let dbPromise;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const name of STORES) {
          if (!db.objectStoreNames.contains(name)) {
            const store = db.createObjectStore(name, { keyPath: 'id' });
            if (name !== 'projects') store.createIndex('projectId', 'projectId');
            if (name === 'photos') store.createIndex('ownerId', 'ownerId');
          }
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  function wrap(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function tx(store, mode = 'readonly') {
    const db = await open();
    return db.transaction(store, mode).objectStore(store);
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  return {
    STORES,
    uid,
    async get(store, id) { return wrap((await tx(store)).get(id)); },
    async all(store) { return wrap((await tx(store)).getAll()); },
    async byProject(store, projectId) {
      return wrap((await tx(store)).index('projectId').getAll(projectId));
    },
    async byOwner(ownerId) {
      return wrap((await tx('photos')).index('ownerId').getAll(ownerId));
    },
    async put(store, obj) {
      const now = new Date().toISOString();
      if (!obj.id) { obj.id = uid(); obj.createdAt = now; }
      obj.updatedAt = now;
      await wrap((await tx(store, 'readwrite')).put(obj));
      return obj;
    },
    async putRaw(store, obj) { return wrap((await tx(store, 'readwrite')).put(obj)); },
    async remove(store, id) {
      await wrap((await tx(store, 'readwrite')).delete(id));
      if (store !== 'photos') {
        for (const p of await this.byOwner(id)) await this.remove('photos', p.id);
      }
    },
    async clear(store) { return wrap((await tx(store, 'readwrite')).clear()); },
    async removeProject(projectId) {
      for (const s of STORES) {
        if (s === 'projects' || s === 'photos') continue;
        for (const item of await this.byProject(s, projectId)) await this.remove(s, item.id);
      }
      await this.remove('projects', projectId);
    }
  };
})();

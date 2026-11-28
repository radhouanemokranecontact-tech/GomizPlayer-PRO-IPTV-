'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel, payload) => ipcRenderer.invoke(channel, payload);

contextBridge.exposeInMainWorld('api', {
  info: () => invoke('app:info'),
  demoPath: () => invoke('app:demoPath'),

  settings: {
    get: () => invoke('settings:get'),
    patch: (patch) => invoke('settings:patch', patch)
  },

  sources: {
    list: () => invoke('sources:list'),
    account: (id) => invoke('sources:account', id),
    setPassword: (id, password) => invoke('sources:setPassword', id, password),
    add: (input) => invoke('sources:add', input),
    update: (id, patch) => invoke('sources:update', { id, patch }),
    remove: (id) => invoke('sources:remove', id),
    refresh: (id) => invoke('sources:refresh', id),
    items: (id) => invoke('sources:items', id)
  },

  net: {
    fetchText: (url, headers) => invoke('net:fetchText', { url, headers })
  },

  dialog: {
    openFile: (kind) => invoke('dialog:openFile', kind)
  },

  backup: {
    export: () => invoke('app:exportBackup'),
    import: () => invoke('app:importBackup'),
    now: () => invoke('app:backupNow'),
    list: () => invoke('app:listBackups')
  },

  storage: {
    stats: () => invoke('app:storageStats'),
    clearCache: () => invoke('app:clearCache'),
    resetSettings: () => invoke('app:resetSettings')
  },

  app: {
    info: () => invoke('app:info'),
    demoPath: () => invoke('app:demoPath'),
    factoryReset: (payload) => invoke('app:factoryReset', payload)
  },

  diagnostics: {
    export: () => invoke('app:exportDiagnostics'),
    log: (kind, extra) => invoke('app:diagnosticsLog', kind, extra),
    tail: (count) => invoke('app:diagnosticsTail', count)
  },

  updates: {
    status: () => invoke('update:status'),
    check: () => invoke('update:check'),
    download: () => invoke('update:download'),
    install: () => invoke('update:install'),
    onStatus: (cb) => {
      const handler = (_e, payload) => cb(payload);
      ipcRenderer.on('update:status', handler);
      return () => ipcRenderer.removeListener('update:status', handler);
    },
    onAvailable: (cb) => {
      const handler = (_e, payload) => cb(payload);
      ipcRenderer.on('update:available', handler);
      return () => ipcRenderer.removeListener('update:available', handler);
    },
    guard: () => invoke('update:guard'),
    dismissRollback: () => invoke('update:dismissRollback'),
    snapshot: () => invoke('update:snapshot')
  },

  files: {
    readText: (file, limit) => invoke('file:readText', { file, limit }),
    readBuffer: (file, limit) => invoke('file:readBuffer', { file, limit })
  },

  library: {
    get: (profile) => invoke('library:get', profile),
    favorite: (item, on, profile) => invoke('library:favorite', { profile, item, on }),
    history: (item, kind, profile) => invoke('library:history', { profile, item, kind }),
    progress: (key, position, duration, profile) => invoke('library:progress', { profile, key, position, duration }),
    search: (term, profile) => invoke('library:search', { profile, term }),
    clear: (what, profile) => invoke('library:clear', { profile, what })
  },

  profiles: {
    list: () => invoke('profiles:list'),
    create: (name) => invoke('profiles:create', name),
    delete: (name) => invoke('profiles:delete', name)
  },

  epg: {
    list: () => invoke('epg:list'),
    add: (url, name) => invoke('epg:add', { url, name }),
    refresh: (id) => invoke('epg:refresh', id),
    remove: (id) => invoke('epg:remove', id),
    channels: (ids) => invoke('epg:channels', ids)
  },

  downloads: {
    list: () => invoke('downloads:list'),
    add: (item) => invoke('downloads:add', item),
    pause: (id) => invoke('downloads:pause', id),
    resume: (id) => invoke('downloads:resume', id),
    remove: (id) => invoke('downloads:remove', id),
    open: (id) => invoke('downloads:open', id),
    onChanged: (cb) => {
      const handler = (_e, list) => cb(list);
      ipcRenderer.on('downloads:changed', handler);
      return () => ipcRenderer.removeListener('downloads:changed', handler);
    }
  },

  shell: {
    showItem: (file) => invoke('shell:showItem', file),
    openExternal: (url) => invoke('shell:openExternal', url)
  },

  clipboard: {
    writeText: (text) => invoke('clipboard:writeText', text)
  },

  appLock: {
    verify: (pin) => invoke('applock:verify', pin),
    set: (payload) => invoke('applock:set', payload)
  },

  window: {
    setAlwaysOnTop: (on) => invoke('window:setAlwaysOnTop', on),
    isAlwaysOnTop: () => invoke('window:isAlwaysOnTop'),
    toggleFullScreen: () => invoke('window:toggleFullScreen'),
    isFullScreen: () => invoke('window:isFullScreen')
  },

  capture: {
    saveScreenshot: (dataUrl, name) => invoke('capture:saveScreenshot', { dataUrl, name })
  },

  pro: {
    status: () => invoke('pro:status'),
    health: {
      scan: (opts) => invoke('pro:health:scan', opts),
      cancel: () => invoke('pro:health:cancel'),
      summary: (sourceId) => invoke('pro:health:summary', { sourceId }),
      setHideDead: (on) => invoke('pro:health:setHideDead', { on }),
      clear: () => invoke('pro:health:clear'),
      onProgress: (cb) => { const h = (_e, p) => cb(p); ipcRenderer.on('pro:health:progress', h); return () => ipcRenderer.removeListener('pro:health:progress', h); },
      onDone: (cb) => { const h = (_e, p) => cb(p); ipcRenderer.on('pro:health:done', h); return () => ipcRenderer.removeListener('pro:health:done', h); }
    },
    dupes: () => invoke('pro:dupes:summary'),
    alternatives: (item) => invoke('pro:alternatives', { key: item && item.key, url: item && item.url }),
    catchupUrl: (item, start, end) => invoke('pro:catchup:url', { item: item && { url: item.url, headers: item.headers, catchup: item.catchup }, start, end }),
    sched: {
      list: () => invoke('pro:sched:list'),
      add: (entry) => invoke('pro:sched:add', entry),
      remove: (id) => invoke('pro:sched:remove', { id })
    },
    parental: {
      get: () => invoke('pro:parental:get'),
      set: (cfg) => invoke('pro:parental:set', cfg),
      setPin: (payload) => invoke('pro:parental:pin:set', payload),
      verifyPin: (pin) => invoke('pro:parental:pin:verify', { pin })
    },
    exportM3U: (opts) => invoke('pro:export:m3u', opts)
  },

  recording: {
    start: (url, headers, name, key) => invoke('recording:start', { url, headers, name, key }),
    stop: () => invoke('recording:stop'),
    status: () => invoke('recording:status'),
    list: () => invoke('recording:list'),
    delete: (file) => invoke('recording:delete', file)
  }
});

const { contextBridge, ipcRenderer } = require('electron');

// Local Database IPC channels (standalone, no Nexus)
const DB_CHANNELS = [
  'db:getProjects', 'db:createProject', 'db:updateProject', 'db:deleteProject',
  'db:getTasks', 'db:createTask', 'db:updateTask', 'db:deleteTask',
  'db:getTimeLogs', 'db:createTimeLog', 'db:updateTimeLog', 'db:deleteTimeLog',
  'db:startTaskTimer', 'db:stopTaskTimer', 'db:getRunningTask',
  'db:getAllData', 'db:importData',
];

contextBridge.exposeInMainWorld('electron', {
  send: (channel, data) => {
    // whitelist channels
    let validChannels = ['start-task', 'open-window', 'ai-create-task', 'open-create-window', 'open-memo-window', 'open-task-memo-window', 'open-todo-window', 'open-ai-window', 'open-settings-window', 'open-project-window', 'open-prompt-library-window', 'open-link-station-window', 'open-chart-window', 'show-toolbar-context-menu', 'save-links-data', 'backup-and-push', 'open-external-link'];
    if (validChannels.includes(channel)) {
      console.log(`[Preload] Sending IPC: ${channel}`);
      ipcRenderer.send(channel, data);
    } else {
      console.warn(`[Preload] Blocked unauthorized IPC: ${channel}`);
    }
  },
  invoke: (channel, data) => {
    let validChannels = ['get-links-data', ...DB_CHANNELS];
    if (validChannels.includes(channel)) {
      console.log(`[Preload] Invoking IPC: ${channel}`);
      return ipcRenderer.invoke(channel, data);
    }
    console.warn(`[Preload] Blocked unauthorized invoke: ${channel}`);
    return Promise.reject(new Error(`Unauthorized channel: ${channel}`));
  },
  receive: (channel, func) => {
    let validChannels = ['on-start-task', 'on-console-log'];
    if (validChannels.includes(channel)) {
      // Deliberately strip event as it includes `sender`
      const subscription = (event, ...args) => func(...args);
      ipcRenderer.on(channel, subscription);
      return () => ipcRenderer.removeListener(channel, subscription);
    }
  }
});

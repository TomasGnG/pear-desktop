import { type BrowserWindow, globalShortcut } from 'electron';
import is from 'electron-is';
import { register as registerElectronLocalShortcut } from 'electron-localshortcut';

import { getSongControls } from '@/providers/song-controls';

import { registerMPRIS } from './mpris';

import type { ShortcutMappingType, ShortcutsPluginConfig } from './index';
import type { BackendContext } from '@/types/contexts';

const MEDIA_KEY_SHORTCUTS = [
  'MediaPlayPause',
  'MediaNextTrack',
  'MediaPreviousTrack',
] as const;

let mediaKeysRegistered = false;
let currentWindow: BrowserWindow | null = null;

function _registerGlobalShortcut(
  webContents: Electron.WebContents,
  shortcut: string,
  action: (webContents: Electron.WebContents) => void,
): boolean {
  const result = globalShortcut.register(shortcut, () => {
    action(webContents);
  });
  if (!result) {
    console.warn(
      `[Shortcuts] Failed to register global shortcut "${shortcut}" — it may be taken by another application`,
    );
  }
  return result;
}

function _registerLocalShortcut(
  win: BrowserWindow,
  shortcut: string,
  action: (webContents: Electron.WebContents) => void,
) {
  registerElectronLocalShortcut(win, shortcut, () => {
    action(win.webContents);
  });
}

function registerMediaKeys(win: BrowserWindow) {
  if (mediaKeysRegistered) return;
  const songControls = getSongControls(win);
  const { playPause, next, previous } = songControls;
  _registerGlobalShortcut(win.webContents, 'MediaPlayPause', playPause);
  _registerGlobalShortcut(win.webContents, 'MediaNextTrack', next);
  _registerGlobalShortcut(win.webContents, 'MediaPreviousTrack', previous);
  mediaKeysRegistered = true;
}

function unregisterMediaKeys() {
  if (!mediaKeysRegistered) return;
  for (const shortcut of MEDIA_KEY_SHORTCUTS) {
    globalShortcut.unregister(shortcut);
  }
  mediaKeysRegistered = false;
}

function registerAllShortcuts(
  win: BrowserWindow,
  container: ShortcutMappingType,
  type: string,
  songControls: ReturnType<typeof getSongControls>,
) {
  for (const _action in container) {
    const action = _action as keyof ShortcutMappingType;

    if (!container[action]) {
      continue;
    }

    console.debug(
      `Registering ${type} shortcut`,
      container[action],
      ':',
      action,
    );
    const actionCallback: () => void = songControls[action];
    if (typeof actionCallback !== 'function') {
      console.warn('Invalid action', action);
      continue;
    }

    if (type === 'global') {
      _registerGlobalShortcut(
        win.webContents,
        container[action],
        actionCallback,
      );
    } else {
      _registerLocalShortcut(win, container[action], actionCallback);
    }
  }
}

export const onMainLoad = async ({
  getConfig,
  window,
}: BackendContext<ShortcutsPluginConfig>) => {
  const config = await getConfig();
  currentWindow = window;

  const songControls = getSongControls(window);

  if (config.overrideMediaKeys) {
    registerMediaKeys(window);
  }

  if (is.linux()) {
    registerMPRIS(window);
  }

  const { global, local } = config;
  registerAllShortcuts(window, global, 'global', songControls);
  registerAllShortcuts(window, local, 'local', songControls);
};

export const onStop = async () => {
  unregisterMediaKeys();
  currentWindow = null;
};

export const onConfigChange = (newConfig: ShortcutsPluginConfig) => {
  if (!currentWindow) return;

  if (newConfig.overrideMediaKeys && !mediaKeysRegistered) {
    registerMediaKeys(currentWindow);
  } else if (!newConfig.overrideMediaKeys && mediaKeysRegistered) {
    unregisterMediaKeys();
  }
};

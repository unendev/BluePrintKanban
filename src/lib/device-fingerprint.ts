/**
 * 设备指纹生成和管理
 */

const DEVICE_ID_KEY = 'app_device_id';

function generateDeviceFingerprint(): string {
  const components = [
    navigator.userAgent,
    navigator.language,
    new Date().getTimezoneOffset(),
    screen.width,
    screen.height,
    screen.colorDepth,
  ];
  
  const fingerprint = components.join('|');
  let hash = 0;
  for (let i = 0; i < fingerprint.length; i++) {
    const char = fingerprint.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

export function getDeviceId(): string {
  if (typeof window === 'undefined') {
    return 'server';
  }

  let deviceId = localStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = generateDeviceFingerprint();
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }
  return deviceId;
}

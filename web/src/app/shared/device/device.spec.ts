import { describe, expect, it } from 'vitest';
import { desktopPlatformFor, detectDevice } from './device';

const UA = {
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36',
  linux: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36',
};

describe('detectDevice', () => {
  it('Windows', () => expect(detectDevice({ userAgent: UA.windows })).toEqual({ os: 'windows', mobile: false }));
  it('macOS', () => expect(detectDevice({ userAgent: UA.mac, maxTouchPoints: 0 })).toEqual({ os: 'macos', mobile: false }));
  it('iPhone', () => expect(detectDevice({ userAgent: UA.iphone, maxTouchPoints: 5 })).toEqual({ os: 'ios', mobile: true }));
  it('iPad que se presenta como Mac (pantalla táctil)', () =>
    expect(detectDevice({ userAgent: UA.mac, maxTouchPoints: 5 })).toEqual({ os: 'ios', mobile: true }));
  it('Android (aunque el UA diga Linux)', () =>
    expect(detectDevice({ userAgent: UA.android, maxTouchPoints: 5 })).toEqual({ os: 'android', mobile: true }));
  it('Linux de escritorio', () => expect(detectDevice({ userAgent: UA.linux })).toEqual({ os: 'linux', mobile: false }));
  it('prefiere Client Hints cuando existen', () =>
    expect(detectDevice({ userAgent: 'Mozilla/5.0', userAgentData: { platform: 'Windows', mobile: false } })).toEqual({
      os: 'windows',
      mobile: false,
    }));
  it('sin navigator: desconocido', () => expect(detectDevice(undefined)).toEqual({ os: 'unknown', mobile: false }));
});

describe('desktopPlatformFor', () => {
  it('solo Windows y macOS tienen instalador', () => {
    expect(desktopPlatformFor('windows')).toBe('windows');
    expect(desktopPlatformFor('macos')).toBe('macos');
    expect(desktopPlatformFor('ios')).toBeNull();
    expect(desktopPlatformFor('android')).toBeNull();
    expect(desktopPlatformFor('linux')).toBeNull();
  });
});

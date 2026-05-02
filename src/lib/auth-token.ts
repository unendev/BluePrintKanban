export const TOKEN_KEY = 'auth_token';
export const USER_KEY = 'auth_user';
export const API_ORIGIN_KEY = 'auth_api_origin';

// 检查当前 API 地址是否与存储的一致，不一致则清除 Token
export function validateTokenOrigin(currentApiUrl: string): void {
  // const storedOrigin = localStorage.getItem(API_ORIGIN_KEY);
  // if (storedOrigin && storedOrigin !== currentApiUrl) {
  //   console.log('[Auth] API origin changed, clearing stored token');
  //   console.log(`  Previous: ${storedOrigin}`);
  //   console.log(`  Current: ${currentApiUrl}`);
  //   removeToken();
  // }
}

// 保存当前 API 地址
export function setApiOrigin(apiUrl: string): void {
  localStorage.setItem(API_ORIGIN_KEY, apiUrl);
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export interface AuthUser {
  id: string;
  email?: string;
  name?: string;
}

export function getUser(): AuthUser | null {
  const userStr = localStorage.getItem(USER_KEY);
  if (!userStr) return null;
  try {
    return JSON.parse(userStr);
  } catch {
    return null;
  }
}

export function setUser(user: AuthUser) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function removeToken() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(API_ORIGIN_KEY);
}


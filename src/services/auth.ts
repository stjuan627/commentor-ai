import type { AuthState } from '../types';

export async function isAuthSupported(): Promise<boolean> {
  return typeof chrome !== 'undefined' && !!chrome.identity;
}

export async function getAuthState(): Promise<AuthState> {
  try {
    const result = await browser.storage.local.get('authState');
    return result.authState || { status: 'disconnected' };
  } catch {
    return { status: 'disconnected' };
  }
}

export async function setAuthState(state: AuthState): Promise<void> {
  await browser.storage.local.set({ authState: state });
}

export async function getAccessToken(): Promise<string | null> {
  const supported = await isAuthSupported();
  if (!supported) {
    return null;
  }

  try {
    const token = await chrome.identity!.getAuthToken({ interactive: false });
    return token || null;
  } catch (error) {
    console.error('Failed to get cached token:', error);
    return null;
  }
}

export async function acquireToken(interactive: boolean = true): Promise<string> {
  const supported = await isAuthSupported();
  if (!supported) {
    throw new Error('Google auth not supported in this browser');
  }

  try {
    await setAuthState({ status: 'connecting' });
    
    const token = await chrome.identity!.getAuthToken({ interactive });
    
    if (!token) {
      await setAuthState({ status: 'error', error: 'No token returned' });
      throw new Error('Failed to acquire token');
    }

    await setAuthState({ status: 'connected' });
    return token;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    await setAuthState({ status: 'error', error: errorMessage });
    throw error;
  }
}

export async function revokeToken(): Promise<void> {
  const supported = await isAuthSupported();
  if (!supported) {
    await setAuthState({ status: 'disconnected' });
    return;
  }

  try {
    const token = await getAccessToken();
    if (token) {
      await chrome.identity!.removeCachedAuthToken({ token });
      await chrome.identity!.clearAllCachedAuthTokens();
    }
    await setAuthState({ status: 'disconnected' });
  } catch (error) {
    console.error('Failed to revoke token:', error);
    await setAuthState({ status: 'disconnected' });
  }
}

export async function validateToken(token: string): Promise<boolean> {
  try {
    const response = await fetch('https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=' + token);
    return response.ok;
  } catch {
    return false;
  }
}

export const decodeJwt = (token: string): any => {
  try {
    const payload = token.split('.')[1];
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = Buffer.from(normalized, 'base64').toString('utf-8');
    return JSON.parse(decoded);
  } catch {
    return null;
  }
};

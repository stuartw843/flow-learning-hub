const isDevelopment = import.meta.env.DEV;
const baseURL = isDevelopment ? 'http://localhost:3001' : '';

export const config = {
  apiBaseUrl: `${baseURL}/api`,
  modulesUrl: `${baseURL}/api/modules`,
};

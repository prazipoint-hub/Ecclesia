import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export const apiClient: AxiosInstance = axios.create({ baseURL: API_BASE_URL, headers: { 'Content-Type': 'application/json' } });

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

apiClient.interceptors.response.use((response) => response, (error) => Promise.reject(error));

import createClient from 'openapi-fetch';
import type { paths } from '@shared/openapi/api-types';

export const API_BASE_URL = 'http://localhost:3000';

const client = createClient<paths>({ baseUrl: API_BASE_URL });

let currentToken: string | null = localStorage.getItem('petai_access_token');

export function setAccessToken(token: string | null) {
  currentToken = token;
  if (token) {
    localStorage.setItem('petai_access_token', token);
  } else {
    localStorage.removeItem('petai_access_token');
  }
}

export function getAccessToken(): string | null {
  return currentToken;
}

function authHeaders() {
  return currentToken
    ? { headers: { Authorization: `Bearer ${currentToken}` } }
    : {};
}

export const api = {
  client,

  async register(email: string, password: string, displayName?: string) {
    const res = await client.POST('/v1/auth/register', {
      body: { email, password, displayName },
    });
    if (res.error) throw new Error((res.error as any)?.message || 'Error en registro');
    if (res.data?.accessToken) {
      setAccessToken(res.data.accessToken);
    }
    return res.data;
  },

  async login(email: string, password: string) {
    const res = await client.POST('/v1/auth/login', {
      body: { email, password },
    });
    if (res.error) throw new Error((res.error as any)?.message || 'Credenciales inválidas');
    if (res.data?.accessToken) {
      setAccessToken(res.data.accessToken);
    }
    return res.data;
  },

  logout() {
    setAccessToken(null);
  },

  async getMe() {
    const res = await client.GET('/v1/me', {
      ...authHeaders(),
    });
    if (res.error) throw new Error('No autenticado');
    return res.data;
  },

  async getCatalog() {
    const res = await client.GET('/v1/catalog');
    if (res.error) throw new Error('Error al obtener catálogo');
    return res.data;
  },

  async getEggs() {
    const res = await client.GET('/v1/eggs', {
      ...authHeaders(),
    });
    if (res.error) throw new Error('Error al listar huevos');
    return res.data;
  },

  async buyEgg() {
    const res = await client.POST('/v1/eggs/buy', {
      ...authHeaders(),
    });
    if (res.error) throw new Error('Error al comprar huevo');
    return res.data;
  },

  async hatchEgg(eggId: string) {
    const res = await client.POST('/v1/eggs/{id}/hatch', {
      params: { path: { id: eggId } },
      ...authHeaders(),
    });
    if (res.error) throw new Error((res.error as any)?.message || 'Error al eclosionar');
    return res.data;
  },

  async getPets() {
    const res = await client.GET('/v1/pets', {
      ...authHeaders(),
    });
    if (res.error) throw new Error('Error al obtener mascotas');
    return res.data;
  },

  async feedPet(petId: string, itemId: string) {
    const res = await client.POST('/v1/pets/{id}/feed', {
      params: { path: { id: petId } },
      body: { itemId },
      ...authHeaders(),
    });
    if (res.error) throw new Error((res.error as any)?.message || 'Error al alimentar');
    return res.data;
  },

  async cleanPet(petId: string) {
    const res = await client.POST('/v1/pets/{id}/clean', {
      params: { path: { id: petId } },
      ...authHeaders(),
    });
    if (res.error) throw new Error((res.error as any)?.message || 'Error al limpiar');
    return res.data;
  },

  async sleepPet(petId: string) {
    const res = await client.POST('/v1/pets/{id}/sleep', {
      params: { path: { id: petId } },
      ...authHeaders(),
    });
    if (res.error) throw new Error((res.error as any)?.message || 'Error al dormir');
    return res.data;
  },

  async wakePet(petId: string) {
    const res = await client.POST('/v1/pets/{id}/wake', {
      params: { path: { id: petId } },
      ...authHeaders(),
    });
    if (res.error) throw new Error((res.error as any)?.message || 'Error al despertar');
    return res.data;
  },

  async healPet(petId: string, itemId: string) {
    const res = await client.POST('/v1/pets/{id}/heal', {
      params: { path: { id: petId } },
      body: { itemId },
      ...authHeaders(),
    });
    if (res.error) throw new Error((res.error as any)?.message || 'Error al curar');
    return res.data;
  },

  async getInventory() {
    const res = await client.GET('/v1/inventory', {
      ...authHeaders(),
    });
    if (res.error) throw new Error('Error al obtener inventario');
    return res.data;
  },

  async getShop() {
    const res = await client.GET('/v1/shop');
    if (res.error) throw new Error('Error al obtener tienda');
    return res.data;
  },

  async buyShopItem(itemId: string, quantity: number = 1) {
    const res = await client.POST('/v1/shop/buy', {
      body: { itemId, quantity },
      ...authHeaders(),
    });
    if (res.error) throw new Error((res.error as any)?.message || 'Error al comprar');
    return res.data;
  },
};

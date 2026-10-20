import { apiClient } from '@/utils/api';
import type { OrganizationUnit } from '@/types/organization';
import type { Committee } from '@/types/committee';
import type { Program } from '@/types/program';

class OrganizationService {
  async getUnits(): Promise<OrganizationUnit[]> {
    const { data } = await apiClient.get('/api/v1/organization/units');
    return data;
  }

  async getUnit(unitId: string): Promise<OrganizationUnit> {
    const { data } = await apiClient.get(`/api/v1/organization/units/${unitId}`);
    return data;
  }

  async getCircuits(districtId: string): Promise<OrganizationUnit[]> {
    const { data } = await apiClient.get(`/api/v1/organization/districts/${districtId}/circuits`);
    return data;
  }

  async getCommittees(scopeId: string): Promise<Committee[]> {
    const { data } = await apiClient.get(`/api/v1/organization/committees?scopeId=${scopeId}`);
    return data;
  }

  async getCommittee(committeeId: string): Promise<Committee> {
    const { data } = await apiClient.get(`/api/v1/organization/committees/${committeeId}`);
    return data;
  }

  async getPrograms(scopeId: string): Promise<Program[]> {
    const { data } = await apiClient.get(`/api/v1/organization/programs?scopeId=${scopeId}`);
    return data;
  }

  async getProgram(programId: string): Promise<Program> {
    const { data } = await apiClient.get(`/api/v1/organization/programs/${programId}`);
    return data;
  }

  async createUnit(data: Partial<OrganizationUnit>): Promise<OrganizationUnit> {
    const response = await apiClient.post('/api/v1/organization/units', data);
    return response.data;
  }

  async updateUnit(unitId: string, data: Partial<OrganizationUnit>): Promise<OrganizationUnit> {
    const response = await apiClient.put(`/api/v1/organization/units/${unitId}`, data);
    return response.data;
  }

  async createCommittee(data: Partial<Committee>): Promise<Committee> {
    const response = await apiClient.post('/api/v1/organization/committees', data);
    return response.data;
  }

  async createProgram(data: Partial<Program>): Promise<Program> {
    const response = await apiClient.post('/api/v1/organization/programs', data);
    return response.data;
  }
}

export const organizationService = new OrganizationService();

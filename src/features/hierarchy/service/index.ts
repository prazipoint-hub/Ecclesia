import { AuthorizedUser } from '@/types';
import { hierarchyRepository } from '../repository';

export class HierarchyService {
  async getWorkspace(churchId: string, user: AuthorizedUser) {
    if (churchId !== user.churchId && !user.permissions.includes('hierarchy:view:all_churches')) {
      throw new Error('Unauthorized: cannot view another church workspace');
    }

    const church = await hierarchyRepository.findChurchWorkspace(churchId);
    if (!church) throw new Error('Church not found');

    return {
      conference: church.circuit?.district?.conference
        ? { id: church.circuit.district.conference.id, name: church.circuit.district.conference.name, code: church.circuit.district.conference.code }
        : null,
      district: church.circuit?.district
        ? { id: church.circuit.district.id, name: church.circuit.district.name, code: church.circuit.district.code }
        : null,
      circuit: church.circuit ? { id: church.circuit.id, name: church.circuit.name } : null,
      church: { id: church.id, name: church.name, location: church.location },
      sections: church.sections.map((section) => ({ id: section.id, name: section.name, code: section.code })),
      organizations: church.organizations.map((organization) => ({
        id: organization.id,
        name: organization.name,
        shortName: organization.shortName,
        type: organization.organizationType,
      })),
    };
  }
}

export const hierarchyService = new HierarchyService();

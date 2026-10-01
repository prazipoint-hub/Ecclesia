import { useState } from 'react';
import { Plus } from 'lucide-react';
import { MainLayout } from '@/components/Layout/MainLayout';
import { ScopeBadge } from '@/components/hierarchy/ScopeBadge';
import { Button } from '@/components/common/Button';
import { EmptyState } from '@/components/common/EmptyState';
import { CreateCommitteeModal } from '@/components/modals/CreateCommitteeModal';
import { EditCommitteeModal } from '@/components/modals/EditCommitteeModal';
import { ConfirmDeleteModal } from '@/components/modals/ConfirmDeleteModal';
import { useOrganization } from '@/hooks/useOrganization';
import { usePermissions } from '@/hooks/usePermissions';
import { organizationService } from '@/services/organizationService';
import type { Committee } from '@/types/committee';
import { BriefcaseBusiness } from 'lucide-react';

export const DistrictCommitteesManagement = () => {
  const { selectedUnitId, getCommitteesForScope } = useOrganization();
  const { hasPermission } = usePermissions();
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedCommittee, setSelectedCommittee] = useState<Committee | null>(null);
  const [committees, setCommittees] = useState<Committee[]>(getCommitteesForScope());
  const [isLoading, setIsLoading] = useState(false);

  const canCreateCommittee = hasPermission('committee', 'CREATE');
  const canEditCommittee = hasPermission('committee', 'UPDATE');
  const canDeleteCommittee = hasPermission('committee', 'DELETE');

  const handleCreateCommittee = async (data: Partial<Committee>) => {
    setIsLoading(true);
    try {
      const newCommittee = await organizationService.createCommittee(data);
      setCommittees([...committees, newCommittee]);
    } catch (error) {
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditCommittee = async (data: Partial<Committee>) => {
    if (!selectedCommittee) return;
    setIsLoading(true);
    try {
      await organizationService.createCommittee(data);
      setCommittees(committees.map((c) => (c.id === selectedCommittee.id ? { ...c, ...data } : c)));
    } catch (error) {
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteCommittee = async () => {
    if (!selectedCommittee) return;
    setCommittees(committees.filter((c) => c.id !== selectedCommittee.id));
  };

  return (
    <MainLayout>
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <ScopeBadge type="DISTRICT" />
              <span className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-500">
                Governance
              </span>
            </div>
            <h1 className="mt-3 text-3xl font-bold text-gray-900">Manage Committees</h1>
          </div>
          {canCreateCommittee && (
            <Button variant="primary" onClick={() => setCreateOpen(true)}>
              <Plus className="h-5 w-5" />
              New Committee
            </Button>
          )}
        </div>

        {committees.length === 0 ? (
          <EmptyState
            icon={BriefcaseBusiness}
            title="No committees yet"
            description="Create your first district committee to get started."
            action={
              canCreateCommittee && (
                <Button variant="primary" onClick={() => setCreateOpen(true)}>
                  Create Committee
                </Button>
              )
            }
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {committees.map((committee) => (
              <div
                key={committee.id}
                className="flex flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900">{committee.name}</h3>
                    <p className="mt-1 text-sm text-gray-600">ID: {committee.id.slice(0, 8)}</p>
                  </div>
                  <div className="flex gap-2">
                    {canEditCommittee && (
                      <button
                        onClick={() => {
                          setSelectedCommittee(committee);
                          setEditOpen(true);
                        }}
                        className="rounded-lg bg-gray-100 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-200"
                      >
                        Edit
                      </button>
                    )}
                    {canDeleteCommittee && (
                      <button
                        onClick={() => {
                          setSelectedCommittee(committee);
                          setDeleteOpen(true);
                        }}
                        className="rounded-lg bg-red-50 px-3 py-1 text-sm font-medium text-red-700 hover:bg-red-100"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <CreateCommitteeModal
          isOpen={createOpen}
          onClose={() => setCreateOpen(false)}
          onSubmit={handleCreateCommittee}
          scopeId={selectedUnitId}
        />

        {selectedCommittee && (
          <>
            <EditCommitteeModal
              isOpen={editOpen}
              onClose={() => {
                setEditOpen(false);
                setSelectedCommittee(null);
              }}
              onSubmit={handleEditCommittee}
              committee={selectedCommittee}
            />
            <ConfirmDeleteModal
              isOpen={deleteOpen}
              title="Delete Committee"
              message={`Are you sure you want to delete "${selectedCommittee.name}"? This action cannot be undone.`}
              onConfirm={handleDeleteCommittee}
              onCancel={() => {
                setDeleteOpen(false);
                setSelectedCommittee(null);
              }}
              isDangerous
            />
          </>
        )}
      </div>
    </MainLayout>
  );
};

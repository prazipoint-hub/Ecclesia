import { useQuery } from '@tanstack/react-query';
import { MainLayout } from '@/components/Layout/MainLayout';
import { apiClient } from '@/utils/api';
import type { FamilyPerson, MyFamily } from '@/types/account';
import { EmptyBlock, ErrorBlock, LoadingBlock, PageHeader, card, titleCase } from './shared';

const RELATIONSHIP_LABELS: Record<MyFamily['relationships'][number]['relationshipType'], string> = {
  SPOUSE: 'Spouse',
  PARENT: 'Parent',
  CHILD: 'Child',
};

const PersonRow = ({ person, detail }: { person: FamilyPerson; detail?: string }) => (
  <li className="flex items-center justify-between py-3">
    <span className="font-medium text-gray-900">
      {person.firstName} {person.lastName}
      {person.isDependent && <span className="ml-2 rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-700">Dependent</span>}
    </span>
    {detail && <span className="text-sm text-gray-500">{detail}</span>}
  </li>
);

export const MyFamilyPage = () => {
  const family = useQuery({
    queryKey: ['me', 'family'],
    queryFn: async () => (await apiClient.get<MyFamily>('/api/v2/me/family')).data,
  });
  const data = family.data;
  const nothing = data && !data.family && data.relationships.length === 0 && data.dependents.length === 0 && data.household.length === 0;

  return (
    <MainLayout>
      <div className="mx-auto max-w-3xl space-y-6">
        <PageHeader title="My family" subtitle={data?.family ? `The ${data.family.name} household.` : 'Your household and family relationships.'} />
        {family.isLoading && <LoadingBlock label="Loading your family…" />}
        {family.isError && <ErrorBlock error={family.error} onRetry={() => family.refetch()} />}
        {nothing && <EmptyBlock message="No family has been recorded for you yet. Contact your church office to add your household." />}
        {data && !nothing && (
          <>
            <section className={card} aria-labelledby="relationships-heading">
              <h2 id="relationships-heading" className="text-lg font-medium text-gray-900">
                Relationships
              </h2>
              {data.relationships.length === 0 ? (
                <p className="mt-3 text-sm text-gray-500">No relationships recorded.</p>
              ) : (
                <ul className="mt-2 divide-y divide-gray-100">
                  {data.relationships.map((relationship) => (
                    <PersonRow key={relationship.id} person={relationship.member} detail={RELATIONSHIP_LABELS[relationship.relationshipType]} />
                  ))}
                </ul>
              )}
            </section>

            <section className={card} aria-labelledby="dependents-heading">
              <h2 id="dependents-heading" className="text-lg font-medium text-gray-900">
                Dependents
              </h2>
              {data.dependents.length === 0 ? (
                <p className="mt-3 text-sm text-gray-500">No dependents recorded.</p>
              ) : (
                <ul className="mt-2 divide-y divide-gray-100">
                  {data.dependents.map((person) => (
                    <PersonRow key={person.id} person={person} />
                  ))}
                </ul>
              )}
            </section>

            <section className={card} aria-labelledby="household-heading">
              <h2 id="household-heading" className="text-lg font-medium text-gray-900">
                Household
              </h2>
              {data.household.length === 0 ? (
                <p className="mt-3 text-sm text-gray-500">No other household members recorded.</p>
              ) : (
                <ul className="mt-2 divide-y divide-gray-100">
                  {data.household.map((person) => (
                    <PersonRow key={person.id} person={person} detail={titleCase(person.membershipStatus)} />
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </MainLayout>
  );
};

export default MyFamilyPage;

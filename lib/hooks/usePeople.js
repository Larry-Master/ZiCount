import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { conditionalFetch } from '@/lib/utils/http';

const COLORS = ['#007bff', '#28a745', '#fd7e14', '#dc3545', '#6f42c1', '#e83e8c', '#20c997', '#ffc107'];

export const usePeople = () => {
  const queryClient = useQueryClient();
  const isClient = typeof window !== 'undefined';

  const query = useQuery({
    queryKey: ['people'],
    queryFn: async () => {
      const prev = queryClient.getQueryData(['people']);
      const data = await conditionalFetch('/api/users', prev);
      if (data?.__notModified) return prev || [];
      return data || [];
    },
    staleTime: 10000, // Consider data fresh for 10 seconds (people rarely change)
    refetchInterval: isClient ? () => (document.visibilityState === 'visible' ? 7000 : false) : false,
    refetchOnWindowFocus: 'always', // Always refetch in background
    refetchOnMount: 'always', // Always refetch in background on mount
  });

  const addMutation = useMutation({
    mutationFn: (name) => apiClient.createUser(name),
    onSuccess: (newPerson) => {
      const current = queryClient.getQueryData(['people']) || [];
      queryClient.setQueryData(['people'], [...current, newPerson]);
    },
  });

  const removeMutation = useMutation({
    mutationFn: (personId) => apiClient.deleteUser(personId),
    onMutate: async (personId) => {
      await queryClient.cancelQueries({ queryKey: ['people'] });
      const prev = queryClient.getQueryData(['people']);
      queryClient.setQueryData(['people'], prev?.filter(p => p.id !== personId) || []);
      return { prev };
    },
    onError: (err, personId, context) => {
      if (context?.prev) queryClient.setQueryData(['people'], context.prev);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['people'] });
    },
  });

  const addPerson = async (name) => {
    if (!name?.trim()) return;
    return addMutation.mutateAsync(name.trim());
  };

  const removePerson = async (personId) => {
    return removeMutation.mutateAsync(personId);
  };

  const getPerson = (personId) => {
    return query.data?.find(p => p.id === personId);
  };

  return {
    people: query.data || [],
    loading: query.isLoading,
    error: query.error ? (query.error.message || query.error) : null,
    addPerson,
    removePerson,
    getPerson,
  };
};

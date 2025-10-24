// Centralized trip sorting utilities for performance

export const STATUS_PRIORITY: Record<string, number> = {
  assigned: 0,
  open: 1,
  completed: 2,
  cancelled: 3
};

export const sortTripsByPriority = (trips: any[]) => {
  return [...trips].sort((a, b) => {
    const priorityDiff = (STATUS_PRIORITY[a.status] || 999) - (STATUS_PRIORITY[b.status] || 999);
    if (priorityDiff !== 0) return priorityDiff;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
};

export const enrichTripsWithDrivers = (trips: any[], driverProfiles: any[]) => {
  return trips.map(request => ({
    ...request,
    assigned_driver: request.assigned_driver_id 
      ? driverProfiles?.find(p => p.id === request.assigned_driver_id) 
      : null
  }));
};

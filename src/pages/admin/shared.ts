// Helpers shared by the admin dashboard and its tab components.

/** Fields the admin request search matches against. */
export const adminReqFields = (r: any): (string | number | null | undefined)[] => [
  r?.service_needed, r?.location, r?.preferred_schedule, r?.job_description,
  r?.first_name, r?.last_name, r?.phone, r?.status,
];

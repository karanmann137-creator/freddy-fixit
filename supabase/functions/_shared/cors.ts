// Shared CORS headers for edge functions. One copy, so a change to the allowed
// headers is made once instead of in every function.
export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

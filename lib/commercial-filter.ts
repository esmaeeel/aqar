export function applyCommercialOnlyToAqarUrl(url: string, commercialOnly: boolean) {
  if (!commercialOnly) return url;
  return `${url}${url.includes("?") ? "&" : "?"}type=eq%2C2`;
}
